import { describe, it, expect } from 'vitest';
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
});
