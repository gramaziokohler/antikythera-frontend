import { describe, it, expect } from 'vitest';
import { validateBlueprint } from '../blueprint-validation';
import type { Blueprint } from '../../types/blueprint';

const validBlueprint: Blueprint = {
  version: '1.0',
  id: 'demo',
  name: 'Demo',
  tasks: [
    { id: 'start', type: 'system.start' },
    {
      id: 'scope_open',
      type: 'system.sleep',
      condition: 'needs_processing',
      scope_start: {},
      depends_on: [{ id: 'start' }],
    },
    {
      id: 'scope_close',
      type: 'system.sleep',
      scope_end: 'scope_open',
      depends_on: [{ id: 'scope_open' }],
    },
    { id: 'end', type: 'system.end', depends_on: [{ id: 'scope_close' }] },
  ],
};

describe('validateBlueprint', () => {
  it('accepts a schema-conformant blueprint, including scope fields', () => {
    const result = validateBlueprint(validBlueprint);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.blueprint).toBe(validBlueprint);
  });

  it('accepts retry and while scope policies', () => {
    const withPolicies = validateBlueprint({
      version: '1.0',
      id: 'p',
      name: 'P',
      tasks: [
        { id: 'start', type: 'system.start' },
        {
          id: 'r',
          type: 'system.sleep',
          scope_start: { retry_policy: { retries: 3, backoff: { constant_ms: 500 } } },
          depends_on: [{ id: 'start' }],
        },
        {
          id: 'w',
          type: 'system.sleep',
          scope_start: { while_policy: { condition: 'x > 0', max_iterations: 10 } },
          scope_end: 'r',
          depends_on: [{ id: 'r' }],
        },
        { id: 'end', type: 'system.end', depends_on: [{ id: 'w' }] },
      ],
    });
    expect(withPolicies.valid).toBe(true);
  });

  it('rejects a blueprint missing required top-level fields', () => {
    const result = validateBlueprint({ tasks: [] });
    expect(result.valid).toBe(false);
    expect(result.blueprint).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a task missing its required id/type', () => {
    const result = validateBlueprint({
      version: '1.0',
      id: 'x',
      name: 'X',
      tasks: [{ description: 'no id or type' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/id|type/);
  });

  it('rejects an unknown scope policy key (schema is closed on scope_start)', () => {
    const result = validateBlueprint({
      version: '1.0',
      id: 'x',
      name: 'X',
      tasks: [{ id: 'a', type: 'system.start', scope_start: { bogus_policy: {} } }],
    });
    expect(result.valid).toBe(false);
  });
});
