import { describe, it, expect } from 'vitest';
import { blueprintToFlow, flowToBlueprint } from '../../utils/blueprint-flow';
import type { Blueprint } from '../../types/blueprint';
import type { AuthorNodeData, BlueprintMeta } from '../../types/blueprint-schema';

// A blueprint exercising all three scope-policy shapes plus a scope_end.
const source: Blueprint = {
  version: '1.0',
  id: 'roundtrip',
  name: 'Round Trip',
  description: 'has scopes',
  tasks: [
    { id: 'start', type: 'system.start' },
    {
      id: 'skip_open',
      type: 'system.sleep',
      condition: 'go',
      scope_start: {},
      depends_on: [{ id: 'start' }],
    },
    {
      id: 'retry_open',
      type: 'system.sleep',
      scope_start: { retry_policy: { retries: 2 } },
      depends_on: [{ id: 'skip_open' }],
    },
    {
      id: 'close',
      type: 'system.sleep',
      scope_end: 'skip_open',
      depends_on: [{ id: 'retry_open' }],
    },
    { id: 'end', type: 'system.end', depends_on: [{ id: 'close' }] },
  ],
};

const meta: BlueprintMeta = {
  id: source.id,
  name: source.name,
  version: source.version,
  description: source.description ?? '',
};

function taskById(bp: Blueprint, id: string) {
  return (bp.tasks ?? []).find((t) => t.id === id);
}

describe('blueprint scope round-trip through the editor model', () => {
  const { nodes, edges } = blueprintToFlow(source);
  const result = flowToBlueprint(nodes, edges, meta);

  it('preserves an empty (skip-policy) scope_start', () => {
    expect(taskById(result, 'skip_open')?.scope_start).toEqual({});
  });

  it('preserves a retry-policy scope_start', () => {
    expect(taskById(result, 'retry_open')?.scope_start).toEqual({
      retry_policy: { retries: 2 },
    });
  });

  it('preserves scope_end on the closing task', () => {
    expect(taskById(result, 'close')?.scope_end).toBe('skip_open');
  });

  it('does not invent scope fields on unrelated tasks', () => {
    const start = taskById(result, 'start');
    expect(start?.scope_start).toBeUndefined();
    expect(start?.scope_end).toBeUndefined();
  });

  it('keeps every task and dependency edge', () => {
    expect((result.tasks ?? []).map((t) => t.id).sort()).toEqual(
      ['close', 'end', 'retry_open', 'skip_open', 'start'].sort(),
    );
    // scope_open depends on start, etc. — spot-check one reconstructed edge.
    expect(taskById(result, 'end')?.depends_on).toEqual([{ id: 'close' }]);
  });
});

// A task's declared types are carried on `type_hint`; `type` is a deprecated
// alias older blueprints still use. The editor reads either and produces only
// `type_hint` — reading just one of the two silently blanked the type of every
// task loaded from the orchestrator, which serialises the canonical field.
const typed: Blueprint = {
  version: '1.0',
  id: 'typed',
  name: 'Typed',
  tasks: [
    { id: 'start', type: 'system.start' },
    {
      id: 'plan',
      type: 'compas_fab.plan',
      inputs: [{ name: 'target', type_hint: 'compas.geometry.Frame' }],
      outputs: [{ name: 'trajectory', type_hint: 'list[compas_fab.robots.Trajectory]' }],
      params: [{ name: 'speed', type_hint: 'float', value: 1.5 }],
      depends_on: [{ id: 'start' }],
    },
    { id: 'end', type: 'system.end', depends_on: [{ id: 'plan' }] },
  ],
};

const typedMeta: BlueprintMeta = { id: typed.id, name: typed.name, version: typed.version, description: '' };

function planNodeData(bp: Blueprint): AuthorNodeData {
  const { nodes } = blueprintToFlow(bp);
  return nodes.find((n) => n.id === 'plan')!.data as AuthorNodeData;
}

describe('declared IO types through the editor model', () => {
  it('shows the declared type of every IO kind in the edit panel', () => {
    const data = planNodeData(typed);

    expect(data.inputs[0].type_hint).toBe('compas.geometry.Frame');
    expect(data.outputs[0].type_hint).toBe('list[compas_fab.robots.Trajectory]');
    expect(data.params[0].type_hint).toBe('float');
  });

  it('keeps every declared type through an open → export round-trip', () => {
    const { nodes, edges } = blueprintToFlow(typed);
    const plan = (flowToBlueprint(nodes, edges, typedMeta).tasks ?? []).find((t) => t.id === 'plan');

    expect(plan?.inputs).toEqual([{ name: 'target', type_hint: 'compas.geometry.Frame' }]);
    expect(plan?.outputs).toEqual([
      { name: 'trajectory', type_hint: 'list[compas_fab.robots.Trajectory]' },
    ]);
    expect(plan?.params).toEqual([{ name: 'speed', type_hint: 'float', value: 1.5 }]);
  });

  it('reads the deprecated `type` alias and canonicalises it onto type_hint', () => {
    const legacy: Blueprint = {
      ...typed,
      tasks: (typed.tasks ?? []).map((task) =>
        task.id === 'plan' ? { ...task, outputs: [{ name: 'trajectory', type: 'str' }] } : task,
      ),
    };

    const data = planNodeData(legacy);
    expect(data.outputs[0].type_hint).toBe('str');
    // The alias is not carried alongside, so the editor has one field to read.
    expect(data.outputs[0].type).toBeUndefined();
  });

  it('leaves an untyped IO item without either type field', () => {
    const untyped: Blueprint = {
      ...typed,
      tasks: (typed.tasks ?? []).map((task) =>
        task.id === 'plan' ? { ...task, outputs: [{ name: 'trajectory' }] } : task,
      ),
    };

    expect(planNodeData(untyped).outputs[0]).toEqual({ name: 'trajectory' });
  });
});
