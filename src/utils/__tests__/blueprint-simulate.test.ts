import { describe, it, expect } from 'vitest';
import type { Blueprint } from '../../types/blueprint-schema';
import {
  deriveSimulationBlueprint,
  deriveSimulationBlueprintId,
  simulatedOutputParamName,
  SIMULATED_OUTPUT_PARAM_PREFIX,
  CompositeTaskNotSupportedError,
  SIMULATION_OPT_OUT_PARAM_NAME,
  isOptedOutParams,
  isOptedOutOfSimulation,
  setOptedOutOfSimulation,
} from '../blueprint-simulate';

const BLUEPRINT: Blueprint = {
  version: '1.0',
  id: 'my-blueprint',
  name: 'My Blueprint',
  description: 'A blueprint',
  tasks: [
    { id: 'start', type: 'system.start' },
    {
      id: 'plan',
      type: 'compas_fab.plan_trajectory',
      description: 'Plan a trajectory',
      condition: 'always',
      inputs: [{ name: 'target', type: 'compas.geometry.Frame' }],
      outputs: [{ name: 'trajectory', type: 'compas_fab.JointTrajectory' }],
      params: [{ name: 'speed', type: 'float', value: 1.5 }],
      depends_on: [{ id: 'start' }],
    },
    { id: 'sleep', type: 'system.sleep', depends_on: [{ id: 'plan' }] },
    { id: 'end', type: 'system.end', depends_on: [{ id: 'sleep' }] },
  ],
};

describe('deriveSimulationBlueprintId', () => {
  it('appends the __sim suffix', () => {
    expect(deriveSimulationBlueprintId('my-blueprint')).toBe('my-blueprint__sim');
  });
});

describe('deriveSimulationBlueprint', () => {
  it('prefixes non-system task types with simulation.', () => {
    const derived = deriveSimulationBlueprint(BLUEPRINT);
    const plan = derived.tasks.find((t) => t.id === 'plan');

    expect(plan?.type).toBe('simulation.compas_fab.plan_trajectory');
  });

  it('leaves system.start, system.end and system.sleep types unchanged', () => {
    const derived = deriveSimulationBlueprint(BLUEPRINT);

    expect(derived.tasks.find((t) => t.id === 'start')?.type).toBe('system.start');
    expect(derived.tasks.find((t) => t.id === 'end')?.type).toBe('system.end');
    expect(derived.tasks.find((t) => t.id === 'sleep')?.type).toBe('system.sleep');
  });

  it('derives the blueprint id as {id}__sim and does not mutate the source', () => {
    const derived = deriveSimulationBlueprint(BLUEPRINT);

    expect(derived.id).toBe('my-blueprint__sim');
    expect(BLUEPRINT.id).toBe('my-blueprint');
    expect(BLUEPRINT.tasks.find((t) => t.id === 'plan')?.type).toBe(
      'compas_fab.plan_trajectory',
    );
  });

  it('is idempotent — re-deriving an already-derived blueprint does not double-prefix types', () => {
    const derived = deriveSimulationBlueprint(BLUEPRINT);
    const reDerived = deriveSimulationBlueprint(derived);

    expect(reDerived.tasks.find((t) => t.id === 'plan')?.type).toBe(
      'simulation.compas_fab.plan_trajectory',
    );
  });

  it('carries unrelated task fields through untouched', () => {
    const derived = deriveSimulationBlueprint(BLUEPRINT);
    const plan = derived.tasks.find((t) => t.id === 'plan');

    expect(plan).toMatchObject({
      id: 'plan',
      description: 'Plan a trajectory',
      condition: 'always',
      inputs: [{ name: 'target', type: 'compas.geometry.Frame' }],
      outputs: [{ name: 'trajectory', type: 'compas_fab.JointTrajectory' }],
      params: [{ name: 'speed', type: 'float', value: 1.5 }],
      depends_on: [{ id: 'start' }],
    });
    expect(derived.name).toBe(BLUEPRINT.name);
    expect(derived.description).toBe(BLUEPRINT.description);
    expect(derived.version).toBe(BLUEPRINT.version);
  });

  it('copies each authored output value onto the derived task as a __sim_out__-prefixed param', () => {
    const withAuthoredOutput: Blueprint = {
      ...BLUEPRINT,
      tasks: BLUEPRINT.tasks.map((task) =>
        task.id === 'plan'
          ? { ...task, outputs: [{ name: 'trajectory', type: 'compas_fab.JointTrajectory', value: { dtype: 'Trajectory' } }] }
          : task,
      ),
    };

    const derived = deriveSimulationBlueprint(withAuthoredOutput);
    const plan = derived.tasks.find((t) => t.id === 'plan');

    expect(plan?.params).toEqual([
      { name: 'speed', type: 'float', value: 1.5 },
      { name: '__sim_out__trajectory', value: { dtype: 'Trajectory' } },
    ]);
    expect(simulatedOutputParamName('trajectory')).toBe('__sim_out__trajectory');
    expect('__sim_out__trajectory'.startsWith(SIMULATED_OUTPUT_PARAM_PREFIX)).toBe(true);
  });

  it('does not add a param for an output with no authored value', () => {
    const derived = deriveSimulationBlueprint(BLUEPRINT);
    const plan = derived.tasks.find((t) => t.id === 'plan');

    // The fixture's `trajectory` output has no `value`, so no __sim_out__ param is added —
    // params carry only the original `speed` param.
    expect(plan?.params).toEqual([{ name: 'speed', type: 'float', value: 1.5 }]);
  });

  it('does not add simulated-output params to system tasks (never rewritten)', () => {
    const withAuthoredSystemOutput: Blueprint = {
      ...BLUEPRINT,
      tasks: BLUEPRINT.tasks.map((task) =>
        task.id === 'start' ? { ...task, outputs: [{ name: 'process_start_time', type: 'timestamp', value: '2026-07-21T10:00' }] } : task,
      ),
    };

    const derived = deriveSimulationBlueprint(withAuthoredSystemOutput);
    const start = derived.tasks.find((t) => t.id === 'start');

    expect(start?.params).toBeUndefined();
  });

  it('re-deriving an already-derived blueprint does not re-copy simulated-output params', () => {
    const withAuthoredOutput: Blueprint = {
      ...BLUEPRINT,
      tasks: BLUEPRINT.tasks.map((task) =>
        task.id === 'plan' ? { ...task, outputs: [{ name: 'trajectory', type: 'str', value: 'ok' }] } : task,
      ),
    };

    const derived = deriveSimulationBlueprint(withAuthoredOutput);
    const reDerived = deriveSimulationBlueprint(derived);

    expect(reDerived.tasks.find((t) => t.id === 'plan')?.params).toEqual(
      derived.tasks.find((t) => t.id === 'plan')?.params,
    );
  });

  it('skips a task opted out of simulation, keeping its real type, while still prefixing every other non-system task', () => {
    const withOptOut: Blueprint = {
      ...BLUEPRINT,
      tasks: BLUEPRINT.tasks.map((task) =>
        task.id === 'plan'
          ? { ...task, params: [...(task.params ?? []), { name: SIMULATION_OPT_OUT_PARAM_NAME, value: true }] }
          : task,
      ),
    };

    const derived = deriveSimulationBlueprint(withOptOut);

    expect(derived.tasks.find((t) => t.id === 'plan')?.type).toBe('compas_fab.plan_trajectory');
  });

  it('does not carry simulated-output params onto an opted-out task', () => {
    const withOptOutAndOutput: Blueprint = {
      ...BLUEPRINT,
      tasks: BLUEPRINT.tasks.map((task) =>
        task.id === 'plan'
          ? {
              ...task,
              outputs: [{ name: 'trajectory', type: 'compas_fab.JointTrajectory', value: { dtype: 'Trajectory' } }],
              params: [...(task.params ?? []), { name: SIMULATION_OPT_OUT_PARAM_NAME, value: true }],
            }
          : task,
      ),
    };

    const derived = deriveSimulationBlueprint(withOptOutAndOutput);
    const plan = derived.tasks.find((t) => t.id === 'plan');

    expect(plan?.params).toEqual([
      { name: 'speed', type: 'float', value: 1.5 },
      { name: SIMULATION_OPT_OUT_PARAM_NAME, value: true },
    ]);
  });

  it('throws CompositeTaskNotSupportedError naming the offending tasks and does not derive anything', () => {
    const withComposite: Blueprint = {
      ...BLUEPRINT,
      tasks: [
        ...BLUEPRINT.tasks,
        { id: 'inner', type: 'system.composite', params: [{ name: 'blueprint', value: 'nested' }] },
      ],
    };

    let caught: unknown;
    try {
      deriveSimulationBlueprint(withComposite);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CompositeTaskNotSupportedError);
    expect((caught as CompositeTaskNotSupportedError).taskIds).toEqual(['inner']);
  });
});

describe('opt-out helpers (issue-sim-05)', () => {
  it('isOptedOutParams is true only when the reserved param is present with value true', () => {
    expect(isOptedOutParams(undefined)).toBe(false);
    expect(isOptedOutParams([])).toBe(false);
    expect(isOptedOutParams([{ name: 'speed', value: 1.5 }])).toBe(false);
    expect(isOptedOutParams([{ name: SIMULATION_OPT_OUT_PARAM_NAME, value: false }])).toBe(false);
    expect(isOptedOutParams([{ name: SIMULATION_OPT_OUT_PARAM_NAME, value: true }])).toBe(true);
  });

  it('isOptedOutOfSimulation reads the flag off a task', () => {
    expect(isOptedOutOfSimulation({ id: 't', type: 'x' })).toBe(false);
    expect(
      isOptedOutOfSimulation({
        id: 't',
        type: 'x',
        params: [{ name: SIMULATION_OPT_OUT_PARAM_NAME, value: true }],
      }),
    ).toBe(true);
  });

  it('setOptedOutOfSimulation adds the flag without disturbing other params', () => {
    const params = setOptedOutOfSimulation([{ name: 'speed', value: 1.5 }], true);
    expect(params).toEqual([
      { name: 'speed', value: 1.5 },
      { name: SIMULATION_OPT_OUT_PARAM_NAME, value: true },
    ]);
  });

  it('setOptedOutOfSimulation removes the flag and leaves other params untouched', () => {
    const params = setOptedOutOfSimulation(
      [{ name: 'speed', value: 1.5 }, { name: SIMULATION_OPT_OUT_PARAM_NAME, value: true }],
      false,
    );
    expect(params).toEqual([{ name: 'speed', value: 1.5 }]);
  });
});
