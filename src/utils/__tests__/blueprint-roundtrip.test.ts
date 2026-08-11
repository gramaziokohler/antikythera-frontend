import { describe, it, expect } from 'vitest';
import { blueprintToFlow, flowToBlueprint } from '../../utils/blueprint-flow';
import type { Blueprint } from '../../types/blueprint';
import type { BlueprintMeta } from '../../types/blueprint-schema';

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
