import { describe, it, expect } from 'vitest';
import type { Blueprint } from '../../types/blueprint-schema';
import {
  deriveSimulationBlueprint,
  deriveSimulationBlueprintId,
  CompositeTaskNotSupportedError,
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
