import { describe, it, expect, vi } from 'vitest';
import { SimulationAgent, SIMULATION_AGENT_TYPE } from '../SimulationAgent';
import { simulatedOutputParamName } from '../../utils/blueprint-simulate';
import { isAnyDataPassthrough } from '../anyDataCodec';
import type { Agent } from '../Agent';
import { Task } from '../Task';
import { antikythera, compas_pb } from '../../proto/bundle';

function taskWithParams(params: Record<string, { stringValue?: string; numberValue?: number; boolValue?: boolean }>) {
  const encoded: { [k: string]: compas_pb.data.IAnyData } = {};
  for (const [key, value] of Object.entries(params)) {
    encoded[key] = { value };
  }
  const message: antikythera.v1.ITaskAssignmentMessage = {
    id: 'task-1',
    type: 'simulation.compas_fab.plan_trajectory',
    params: encoded,
  };
  return new Task(message);
}

describe('SimulationAgent', () => {
  it('has agent type "simulation"', () => {
    expect(new SimulationAgent().type).toBe(SIMULATION_AGENT_TYPE);
  });

  it('canHandleTool claims any tool name', () => {
    const agent: Agent = new SimulationAgent();
    expect(agent.canHandleTool?.('compas_fab.plan_trajectory')).toBe(true);
    expect(agent.canHandleTool?.('anything.at.all')).toBe(true);
  });

  it('completes with simulated outputs found under the __sim_out__ prefix, keyed by output name', async () => {
    const agent = new SimulationAgent();
    const task = taskWithParams({
      speed: { numberValue: 1.5 },
      [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' },
    });

    const result = (await agent.invokeTool!('compas_fab.plan_trajectory', task)) as Record<string, unknown>;

    expect(Object.keys(result)).toEqual(['trajectory']);
    // Forwarded as a raw-AnyData passthrough (see anyDataCodec.ts), not decoded — the param may
    // have arrived using a wire shape the frontend has no reason to understand.
    expect(isAnyDataPassthrough(result.trajectory)).toBe(true);
    expect((result.trajectory as { anyData: unknown }).anyData).toEqual({ value: { stringValue: 'ok' } });
  });

  it('forwards a param wrapped in an AnyData shape the frontend does not decode (e.g. a native COMPAS geometry message) unchanged', async () => {
    const agent = new SimulationAgent();
    const message: antikythera.v1.ITaskAssignmentMessage = {
      id: 'task-2',
      type: 'simulation.demo.make_frame',
      params: {
        [simulatedOutputParamName('frame')]: {
          message: {
            type_url: 'type.googleapis.com/compas_pb.data.FrameData',
            value: new Uint8Array([1, 2, 3]),
          },
        },
      },
    };
    const task = new Task(message);

    const result = (await agent.invokeTool!('demo.make_frame', task)) as Record<string, unknown>;

    expect((result.frame as { anyData: unknown }).anyData).toEqual({
      message: { type_url: 'type.googleapis.com/compas_pb.data.FrameData', value: new Uint8Array([1, 2, 3]) },
    });
  });

  it('holds (never resolves) when no simulated output param is present', async () => {
    const agent = new SimulationAgent();
    const task = taskWithParams({ speed: { numberValue: 1.5 } });

    let settled = false;
    agent.invokeTool!('compas_fab.plan_trajectory', task).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
  });

  describe('breakpoints (issue-sim-06)', () => {
    it('toggling a breakpoint is reflected in isBreakpointed and the snapshot', () => {
      const agent = new SimulationAgent();
      expect(agent.isBreakpointed('task-1')).toBe(false);

      agent.toggleBreakpoint('task-1');
      expect(agent.isBreakpointed('task-1')).toBe(true);
      expect(agent.getSnapshot().breakpoints.has('task-1')).toBe(true);

      agent.toggleBreakpoint('task-1');
      expect(agent.isBreakpointed('task-1')).toBe(false);
      expect(agent.getSnapshot().breakpoints.has('task-1')).toBe(false);
    });

    it('setBreakOnEveryTask marks every task id as breakpointed', () => {
      const agent = new SimulationAgent();
      agent.setBreakOnEveryTask(true);

      expect(agent.isBreakpointed('task-1')).toBe(true);
      expect(agent.isBreakpointed('never-explicitly-marked')).toBe(true);
      expect(agent.getSnapshot().breakOnEveryTask).toBe(true);
    });

    it('holds a breakpointed task even though it has an authored output', async () => {
      const agent = new SimulationAgent();
      agent.toggleBreakpoint('task-1');
      const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' } });

      let settled = false;
      agent.invokeTool!('compas_fab.plan_trajectory', task).then(() => {
        settled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(settled).toBe(false);
      expect(agent.isHeld('task-1')).toBe(true);
      expect(agent.requiresValue('task-1')).toBe(false);
      expect(agent.getSnapshot().heldTaskIds).toEqual(['task-1']);
    });

    it('does not hold a non-breakpointed task with an authored output', async () => {
      const agent = new SimulationAgent();
      const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' } });

      await agent.invokeTool!('compas_fab.plan_trajectory', task);

      expect(agent.isHeld('task-1')).toBe(false);
    });

    it('reports requiresValue for a task held with no authored output', async () => {
      const agent = new SimulationAgent();
      const task = taskWithParams({ speed: { numberValue: 1.5 } });

      agent.invokeTool!('compas_fab.plan_trajectory', task);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(agent.isHeld('task-1')).toBe(true);
      expect(agent.requiresValue('task-1')).toBe(true);
    });
  });

  describe('continueHeldTask (issue-sim-06)', () => {
    it('resolves the held invocation with the supplied outputs', async () => {
      const agent = new SimulationAgent();
      agent.toggleBreakpoint('task-1');
      const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'authored' } });

      const pending = agent.invokeTool!('compas_fab.plan_trajectory', task);
      await new Promise((resolve) => setTimeout(resolve, 10));

      agent.continueHeldTask('task-1', { trajectory: 'edited-value' });

      const result = await pending;
      expect(result).toEqual({ trajectory: 'edited-value' });
      expect(agent.isHeld('task-1')).toBe(false);
    });

    it('clears the breakpoint once continued, so the next claim of the same id does not re-hold', async () => {
      const agent = new SimulationAgent();
      agent.toggleBreakpoint('task-1');
      const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'authored' } });

      const pending = agent.invokeTool!('compas_fab.plan_trajectory', task);
      await new Promise((resolve) => setTimeout(resolve, 10));
      agent.continueHeldTask('task-1', { trajectory: 'v' });
      await pending;

      expect(agent.isBreakpointed('task-1')).toBe(false);
    });

    it('refuses to continue a task that requires a value with no outputs supplied', async () => {
      const agent = new SimulationAgent();
      const task = taskWithParams({ speed: { numberValue: 1.5 } });

      let settled = false;
      agent.invokeTool!('compas_fab.plan_trajectory', task).then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      agent.continueHeldTask('task-1', {});
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(settled).toBe(false);
      expect(agent.isHeld('task-1')).toBe(true);
    });

    it('continues a task that requires a value once a value is supplied', async () => {
      const agent = new SimulationAgent();
      const task = taskWithParams({ speed: { numberValue: 1.5 } });

      const pending = agent.invokeTool!('compas_fab.plan_trajectory', task);
      await new Promise((resolve) => setTimeout(resolve, 10));

      agent.continueHeldTask('task-1', { trajectory: 'supplied' });

      expect(await pending).toEqual({ trajectory: 'supplied' });
    });

    it('is a no-op for a task id that is not currently held', () => {
      const agent = new SimulationAgent();
      expect(() => agent.continueHeldTask('never-held', { a: 1 })).not.toThrow();
    });
  });

  describe('simulation delay (issue-sim-07)', () => {
    it('defaults to no delay', () => {
      const agent = new SimulationAgent();
      expect(agent.getDelayMs()).toBe(0);
      expect(agent.getSnapshot().delayMs).toBe(0);
    });

    it('setDelayMs updates getDelayMs and the snapshot, and can be changed repeatedly', () => {
      const agent = new SimulationAgent();
      agent.setDelayMs(500);
      expect(agent.getDelayMs()).toBe(500);
      expect(agent.getSnapshot().delayMs).toBe(500);

      agent.setDelayMs(2000);
      expect(agent.getDelayMs()).toBe(2000);
      expect(agent.getSnapshot().delayMs).toBe(2000);
    });

    it('clamps a negative delay to zero', () => {
      const agent = new SimulationAgent();
      agent.setDelayMs(-100);
      expect(agent.getDelayMs()).toBe(0);
    });

    it('notifies subscribers when the delay changes', () => {
      const agent = new SimulationAgent();
      const listener = vi.fn();
      agent.subscribe(listener);

      agent.setDelayMs(1000);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('delays completion of a non-breakpointed authored-output task by the configured amount, applied after the claim', async () => {
      vi.useFakeTimers();
      try {
        const agent = new SimulationAgent();
        agent.setDelayMs(5000);
        const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' } });

        let resolved = false;
        const pending = agent.invokeTool!('compas_fab.plan_trajectory', task).then((r) => {
          resolved = true;
          return r;
        });

        // Nothing was ever put in the `held` map — the task claimed and is merely waiting,
        // not held at a breakpoint (issue-sim-06's separate mechanism).
        expect(agent.isHeld('task-1')).toBe(false);

        await vi.advanceTimersByTimeAsync(4999);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(resolved).toBe(true);

        const result = (await pending) as Record<string, unknown>;
        expect(Object.keys(result)).toEqual(['trajectory']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not delay a task that holds (breakpointed, or with no authored output) — the hold is already indefinite', async () => {
      const agent = new SimulationAgent();
      agent.setDelayMs(10_000);
      agent.toggleBreakpoint('task-1');
      const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' } });

      let settled = false;
      agent.invokeTool!('compas_fab.plan_trajectory', task).then(() => {
        settled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(settled).toBe(false);
      expect(agent.isHeld('task-1')).toBe(true);
    });

    it('a zero delay (the default) completes an authored-output task without waiting', async () => {
      const agent = new SimulationAgent();
      const task = taskWithParams({ [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' } });

      const result = (await agent.invokeTool!('compas_fab.plan_trajectory', task)) as Record<string, unknown>;

      expect(Object.keys(result)).toEqual(['trajectory']);
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on breakpoint toggle, break-on-every-task, and continue', async () => {
      const agent = new SimulationAgent();
      const listener = vi.fn();
      const unsubscribe = agent.subscribe(listener);

      agent.toggleBreakpoint('task-1');
      agent.setBreakOnEveryTask(true);
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      agent.toggleBreakpoint('task-2');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('wire task id translation (issue-sim-06)', () => {
    // The orchestrator qualifies every task's wire id with its owning blueprint's id
    // (`_create_global_id`: `{blueprint_id}.{task_id}`), confirmed against a live session — see
    // progress.txt. Breakpoints and the held-task bookkeeping must operate on the plain id the
    // graph and the breakpoint UI use, not the wire id, or a breakpoint set from the UI would
    // never match a claimed task.
    function taskWithWireId(id: string) {
      const message: antikythera.v1.ITaskAssignmentMessage = {
        id,
        type: 'simulation.demo.tool',
        params: {},
      };
      return new Task(message);
    }

    it('holds a task breakpointed by its plain id even though its wire id is blueprint-qualified', async () => {
      const agent = new SimulationAgent('my-bp__sim');
      agent.toggleBreakpoint('task-1');
      const task = taskWithWireId('my-bp__sim.task-1');

      agent.invokeTool!('demo.tool', task);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(agent.isHeld('task-1')).toBe(true);
      expect(agent.getSnapshot().heldTaskIds).toEqual(['task-1']);
    });

    it('continueHeldTask keyed by the plain id releases the qualified-wire-id hold', async () => {
      const agent = new SimulationAgent('my-bp__sim');
      agent.toggleBreakpoint('task-1');
      const task = taskWithWireId('my-bp__sim.task-1');

      const pending = agent.invokeTool!('demo.tool', task);
      await new Promise((resolve) => setTimeout(resolve, 10));
      agent.continueHeldTask('task-1', { result: 'v' });

      expect(await pending).toEqual({ result: 'v' });
    });

    it('leaves a wire id unchanged when it does not carry the blueprint id prefix', async () => {
      const agent = new SimulationAgent('my-bp__sim');
      agent.toggleBreakpoint('task-1');
      const task = taskWithWireId('task-1'); // not qualified

      agent.invokeTool!('demo.tool', task);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(agent.isHeld('task-1')).toBe(true);
    });

    it('does not translate ids when constructed without a blueprintId', async () => {
      const agent = new SimulationAgent();
      const task = taskWithWireId('my-bp__sim.task-1');

      agent.invokeTool!('demo.tool', task);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(agent.isHeld('my-bp__sim.task-1')).toBe(true);
      expect(agent.isHeld('task-1')).toBe(false);
    });
  });
});
