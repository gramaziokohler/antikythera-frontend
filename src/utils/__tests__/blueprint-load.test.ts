import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeBlueprint, fetchBlueprint } from '../blueprint-load';
import type { Blueprint } from '../../types/blueprint-schema';

/**
 * Captured from the orchestrator's own serialiser (`json_dumps` over the Blueprint model) — the
 * exact payload `GET /blueprints/{id}` returns, COMPAS wrapper, `null` blanks and all.
 */
const COMPAS_BLUEPRINT = {
  dtype: 'antikythera.models/Blueprint',
  guid: 'bp-guid',
  name: 'Demo',
  data: {
    id: 'demo',
    name: 'Demo',
    version: '1.0',
    description: 'desc',
    scopes: [],
    tasks: [
      {
        dtype: 'antikythera.models/Task',
        guid: 'start-guid',
        data: {
          id: 'start',
          type: 'system.start',
          description: null,
          condition: null,
          inputs: [],
          outputs: [],
          params: [],
          depends_on: [],
          state: 'PENDING',
          scope_start: null,
          scope_end: null,
        },
      },
      {
        dtype: 'antikythera.models/Task',
        guid: 'plan-guid',
        data: {
          id: 'plan',
          type: 'compas_fab.plan',
          description: 'd',
          condition: null,
          inputs: [
            {
              dtype: 'antikythera.models/TaskInput',
              guid: 'in-guid',
              name: 'mesh',
              data: { name: 'mesh', type_hint: null, value: null, description: null, get_from: 'geo' },
            },
          ],
          outputs: [
            {
              dtype: 'antikythera.models/TaskOutput',
              guid: 'out-guid',
              name: 'trajectory',
              data: { name: 'trajectory', type_hint: 'str', value: 'v', description: null, set_to: null },
            },
          ],
          params: [
            {
              dtype: 'antikythera.models/TaskParam',
              guid: 'param-guid',
              name: 'speed',
              data: { name: 'speed', type_hint: null, value: 1.5, description: null },
            },
          ],
          depends_on: [
            {
              dtype: 'antikythera.models/Dependency',
              guid: 'dep-guid',
              data: { id: 'start', type: 'FS' },
            },
          ],
          state: 'PENDING',
          scope_start: null,
          scope_end: null,
        },
      },
    ],
  },
};

describe('normalizeBlueprint', () => {
  it('unwraps a COMPAS-serialised blueprint into the authoring shape', () => {
    const bp = normalizeBlueprint(COMPAS_BLUEPRINT);

    expect(bp).toEqual({
      version: '1.0',
      id: 'demo',
      name: 'Demo',
      description: 'desc',
      tasks: [
        { id: 'start', type: 'system.start' },
        {
          id: 'plan',
          type: 'compas_fab.plan',
          description: 'd',
          inputs: [{ name: 'mesh', get_from: 'geo' }],
          outputs: [{ name: 'trajectory', type_hint: 'str', value: 'v' }],
          params: [{ name: 'speed', value: 1.5 }],
          depends_on: [{ id: 'start', type: 'FS' }],
        },
      ],
    } satisfies Blueprint);
  });

  it('leaves an already-flat blueprint (as Export writes it) untouched', () => {
    const flat: Blueprint = {
      version: '2.0',
      id: 'flat',
      name: 'Flat',
      tasks: [
        { id: 'start', type: 'system.start' },
        { id: 'end', type: 'system.end', depends_on: [{ id: 'start' }] },
      ],
    };

    expect(normalizeBlueprint(structuredClone(flat))).toEqual(flat);
  });

  it('reads a declared type from the deprecated `type` alias too', () => {
    // The orchestrator serialises `type_hint`; blueprints written before the
    // rename carry `type`. Reading only one loses every type declared with the
    // other, which is invisible until an author reopens the blueprint.
    const bp = normalizeBlueprint({
      data: {
        id: 'legacy',
        name: 'Legacy',
        tasks: [
          {
            data: {
              id: 'plan',
              type: 'compas_fab.plan',
              outputs: [{ data: { name: 'trajectory', type: 'str' } }],
            },
          },
        ],
      },
    });

    expect(bp.tasks[0].outputs).toEqual([{ name: 'trajectory', type_hint: 'str' }]);
  });

  it('round-trips: a normalised blueprint normalises to itself', () => {
    const once = normalizeBlueprint(COMPAS_BLUEPRINT);
    expect(normalizeBlueprint(structuredClone(once))).toEqual(once);
  });

  it('falls back to the id for a missing name and to 1.0 for a missing version', () => {
    const bp = normalizeBlueprint({ data: { id: 'bare', tasks: [] } });
    expect(bp).toEqual({ version: '1.0', id: 'bare', name: 'bare', tasks: [] });
  });

  it('rejects a payload with no id rather than opening a nameless blueprint', () => {
    expect(() => normalizeBlueprint({ data: { tasks: [] } })).toThrow(/missing an id/);
  });
});

describe('fetchBlueprint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalises what the endpoint returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => COMPAS_BLUEPRINT }),
    );

    const bp = await fetchBlueprint('/api', 'demo');

    expect(fetch).toHaveBeenCalledWith('/api/blueprints/demo');
    expect(bp.id).toBe('demo');
    expect(bp.tasks.map((t) => t.id)).toEqual(['start', 'plan']);
  });

  it('reports a missing blueprint by name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchBlueprint('/api', 'nope')).rejects.toThrow('Blueprint "nope" not found');
  });

  it('escapes the id into the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => COMPAS_BLUEPRINT }),
    );

    await fetchBlueprint('/api', 'my blueprint/v2');

    expect(fetch).toHaveBeenCalledWith('/api/blueprints/my%20blueprint%2Fv2');
  });
});
