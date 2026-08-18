import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { AuthorNodeData, ScopeStart } from '../../types/blueprint-schema';
import {
  deriveScopeBoundary,
  deriveScopes,
  describePolicy,
  policyTypeOf,
  scopeFrames,
  validateScopes,
  withPolicyType,
  withoutTasks,
} from '../blueprint-scopes';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

interface TaskSpec {
  id: string;
  scopeStart?: ScopeStart;
  scopeEnd?: string;
  x?: number;
  y?: number;
}

function makeNode({ id, scopeStart, scopeEnd, x = 0, y = 0 }: TaskSpec): Node {
  const data: AuthorNodeData = {
    taskType: 'system.sleep',
    description: '',
    condition: '',
    inputs: [],
    outputs: [],
    params: [],
    ...(scopeStart !== undefined ? { scopeStart } : {}),
    ...(scopeEnd !== undefined ? { scopeEnd } : {}),
  };
  return { id, type: 'authorTask', position: { x, y }, data };
}

function makeEdges(pairs: [string, string][]): Edge[] {
  return pairs.map(([source, target]) => ({ id: `${source}->${target}`, source, target }));
}

/** start → a → b → c → end, laid out left to right. */
function chain(specs: Partial<Record<string, TaskSpec>> = {}) {
  const ids = ['start', 'a', 'b', 'c', 'end'];
  const nodes = ids.map((id, i) => makeNode({ id, x: i * 300, y: 0, ...specs[id] }));
  const edges = makeEdges([
    ['start', 'a'],
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'end'],
  ]);
  return { nodes, edges };
}

/* ------------------------------------------------------------------ */

describe('deriveScopes', () => {
  it('pairs an opener with its closer and derives the region between them', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    const [scope] = deriveScopes(nodes, edges);

    expect(scope.id).toBe('a');
    expect(scope.startId).toBe('a');
    expect(scope.endId).toBe('c');
    expect(scope.taskIds).toEqual(['a', 'b', 'c']);
  });

  it('falls back to the opening task id when the scope has no name', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    expect(deriveScopes(nodes, edges)[0].label).toBe('a');
  });

  it('prefers the policy name as the label', () => {
    const { nodes, edges } = chain({
      a: { id: 'a', scopeStart: { name: 'Refinement loop' } },
      c: { id: 'c', scopeEnd: 'a' },
    });
    expect(deriveScopes(nodes, edges)[0].label).toBe('Refinement loop');
  });

  it('skips an opener with no closing task, since its region is undefined', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} } });
    expect(deriveScopes(nodes, edges)).toEqual([]);
  });

  it('reports how many scopes contain each one, so nested frames can be inset', () => {
    const { nodes, edges } = chain({
      a: { id: 'a', scopeStart: { name: 'outer' } },
      b: { id: 'b', scopeStart: { name: 'inner' } },
      c: { id: 'c', scopeStart: undefined, scopeEnd: 'b' },
    });
    // 'end' closes the outer scope; 'c' closes the inner one.
    nodes[4].data = { ...(nodes[4].data as AuthorNodeData), scopeEnd: 'a' };

    const byLabel = Object.fromEntries(deriveScopes(nodes, edges).map((s) => [s.label, s]));
    expect(byLabel.outer.depth).toBe(0);
    expect(byLabel.inner.depth).toBe(1);
    expect(byLabel.inner.taskIds).toEqual(['b', 'c']);
  });
});

describe('policy shape', () => {
  it('resolves the policy type from which key is present', () => {
    expect(policyTypeOf({})).toBe('skip');
    expect(policyTypeOf(undefined)).toBe('skip');
    expect(policyTypeOf({ retry_policy: { retries: 2 } })).toBe('retry');
    expect(policyTypeOf({ while_policy: { condition: 'x' } })).toBe('while');
  });

  it('drops the previous policy when switching type, so only one can ever apply', () => {
    const retry: ScopeStart = { name: 'loop', retry_policy: { retries: 3 } };

    const asWhile = withPolicyType(retry, 'while');
    expect(asWhile.retry_policy).toBeUndefined();
    expect(asWhile.while_policy).toEqual({ condition: '' });
    expect(asWhile.name).toBe('loop');

    const asSkip = withPolicyType(retry, 'skip');
    expect(asSkip).toEqual({ name: 'loop' });
  });

  it('seeds a policy the scope has never had with usable defaults', () => {
    expect(withPolicyType({}, 'retry').retry_policy).toEqual({ retries: 1 });
    expect(withPolicyType({}, 'while').while_policy).toEqual({ condition: '' });
  });

  it('keeps settings that are passed back in, so the panel can undo a misclick', () => {
    const original: ScopeStart = { while_policy: { condition: 'not done', max_iterations: 5 } };
    const asRetry = withPolicyType(original, 'retry');
    // The panel re-supplies what it dropped when switching back.
    const back = withPolicyType({ ...original, ...asRetry }, 'while');
    expect(back.while_policy).toEqual(original.while_policy);
  });

  it('summarises a policy for the frame label', () => {
    expect(describePolicy({ retry_policy: { retries: 3 } })).toBe('3x');
    expect(describePolicy({ while_policy: { condition: 'not done', max_iterations: 10 } })).toBe(
      'not done (max 10)',
    );
    expect(describePolicy({})).toBe('');
  });
});

describe('deriveScopeBoundary', () => {
  it('picks the entry and exit tasks out of a selected region', () => {
    const { nodes, edges } = chain();
    const { boundary, error } = deriveScopeBoundary(['a', 'b', 'c'], nodes, edges);

    expect(error).toBeNull();
    expect(boundary).toMatchObject({ startId: 'a', endId: 'c', taskIds: ['a', 'b', 'c'] });
  });

  it('pulls in tasks that sit between the entry and exit but were not selected', () => {
    const { nodes, edges } = chain();
    const { boundary } = deriveScopeBoundary(['a', 'c'], nodes, edges);

    expect(boundary?.taskIds).toEqual(['a', 'b', 'c']);
    expect(boundary?.implied).toEqual(['b']);
  });

  it('rejects a selection with no single entry task', () => {
    // start → a → c, start → b → c: selecting a, b, c leaves two entry tasks.
    const nodes = ['start', 'a', 'b', 'c'].map((id) => makeNode({ id }));
    const edges = makeEdges([
      ['start', 'a'],
      ['start', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);

    const { boundary, error } = deriveScopeBoundary(['a', 'b', 'c'], nodes, edges);
    expect(boundary).toBeNull();
    expect(error).toMatch(/single entry task/);
  });

  it('rejects a selection spanning disconnected parts of the graph', () => {
    const { nodes, edges } = chain();
    const extra = [...nodes, makeNode({ id: 'aside' })];
    const { boundary, error } = deriveScopeBoundary(['a', 'b', 'aside'], extra, edges);

    expect(boundary).toBeNull();
    expect(error).toMatch(/one region of the graph/);
  });

  it('refuses a second scope on a task that already opens one', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    const { error } = deriveScopeBoundary(['a', 'b', 'c'], nodes, edges);
    expect(error).toMatch(/already opens a scope/);
  });

  it('allows a scope nested fully inside another', () => {
    const { nodes, edges } = chain({
      start: { id: 'start', scopeStart: {} },
      end: { id: 'end', scopeEnd: 'start' },
    });
    const { boundary, error } = deriveScopeBoundary(['a', 'b'], nodes, edges);

    expect(error).toBeNull();
    expect(boundary).toMatchObject({ startId: 'a', endId: 'b' });
  });

  it('refuses a scope that overlaps an existing one without nesting', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    // start..b straddles the a..c scope: neither contains the other.
    const { boundary, error } = deriveScopeBoundary(['start', 'a', 'b'], nodes, edges);

    expect(boundary).toBeNull();
    expect(error).toMatch(/overlaps scope/);
  });
});

describe('validateScopes', () => {
  it('accepts a well-formed scope', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    expect(validateScopes(nodes, edges)).toEqual([]);
  });

  it('flags an opener with no closing task', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} } });
    expect(validateScopes(nodes, edges)).toEqual(["Scope 'a' has no closing task"]);
  });

  it('flags a scope_end pointing at a task that does not open a scope', () => {
    const { nodes, edges } = chain({ c: { id: 'c', scopeEnd: 'a' } });
    expect(validateScopes(nodes, edges)).toContain(
      "Task 'c' closes scope 'a', but that task does not open one",
    );
  });

  it('flags a scope_end pointing at a task that no longer exists', () => {
    const { nodes, edges } = chain({ c: { id: 'c', scopeEnd: 'ghost' } });
    expect(validateScopes(nodes, edges)).toContain(
      "Task 'c' closes scope 'ghost', which no longer exists",
    );
  });

  it('flags two tasks closing the same scope', () => {
    const { nodes, edges } = chain({
      a: { id: 'a', scopeStart: {} },
      b: { id: 'b', scopeEnd: 'a' },
      c: { id: 'c', scopeEnd: 'a' },
    });
    expect(validateScopes(nodes, edges)).toContain("Scope 'a' is closed twice, by 'b' and 'c'");
  });

  it('flags interlaced scopes, which the orchestrator would reject on upload', () => {
    const { nodes, edges } = chain({
      start: { id: 'start', scopeStart: { name: 'first' } },
      b: { id: 'b', scopeEnd: 'start', scopeStart: undefined },
      a: { id: 'a', scopeStart: { name: 'second' } },
      end: { id: 'end', scopeEnd: 'a' },
    });
    expect(validateScopes(nodes, edges)).toContain(
      "Scopes 'first' and 'second' overlap without nesting",
    );
  });
});

describe('withoutTasks', () => {
  const dataOf = (nodes: Node[], id: string) =>
    nodes.find((n) => n.id === id)!.data as AuthorNodeData;

  it('drops the closing marker when the opening task is deleted', () => {
    const { nodes } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    const survivors = withoutTasks(nodes, ['a']);

    expect(survivors.map((n) => n.id)).not.toContain('a');
    expect(dataOf(survivors, 'c').scopeEnd).toBeUndefined();
  });

  it('drops the opening policy when the closing task is deleted', () => {
    const { nodes } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    const survivors = withoutTasks(nodes, ['c']);

    expect(dataOf(survivors, 'a').scopeStart).toBeUndefined();
  });

  it('leaves a scope alone when a task inside it is deleted', () => {
    const { nodes } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    const survivors = withoutTasks(nodes, ['b']);

    expect(dataOf(survivors, 'a').scopeStart).toEqual({});
    expect(dataOf(survivors, 'c').scopeEnd).toBe('a');
  });
});

describe('scopeFrames', () => {
  const fallback = { width: 240, height: 100 };

  it('boxes the members of a scope with padding', () => {
    const { nodes, edges } = chain({ a: { id: 'a', scopeStart: {} }, c: { id: 'c', scopeEnd: 'a' } });
    const [frame] = scopeFrames(deriveScopes(nodes, edges), nodes, fallback);

    // Members a, b, c sit at x = 300, 600, 900 with width 240.
    expect(frame.x).toBeLessThan(300);
    expect(frame.x + frame.width).toBeGreaterThan(900 + 240);
  });

  it('draws a nested scope tighter than its parent so the borders stay apart', () => {
    const { nodes, edges } = chain({
      start: { id: 'start', scopeStart: { name: 'outer' } },
      end: { id: 'end', scopeEnd: 'start' },
      a: { id: 'a', x: 300, scopeStart: { name: 'inner' } },
      b: { id: 'b', x: 600, scopeEnd: 'a' },
    });
    const frames = scopeFrames(deriveScopes(nodes, edges), nodes, fallback);
    const outer = frames.find((f) => f.scope.label === 'outer')!;
    const inner = frames.find((f) => f.scope.label === 'inner')!;

    expect(frames[0].scope.label).toBe('outer'); // outermost first, so it renders behind
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
  });
});

describe('while-policy conditions', () => {
  const whileScope = (condition: string) =>
    chain({
      a: { id: 'a', scopeStart: { while_policy: { condition } } },
      c: { id: 'c', scopeEnd: 'a' },
    });

  it('flags a while scope whose condition was never written', () => {
    // The orchestrator parses the expression on upload and rejects the whole
    // blueprint on an empty one, so Save would fail long after the scope was made.
    const { nodes, edges } = whileScope('');
    expect(validateScopes(nodes, edges)).toContain(
      "Scope 'a' loops while a condition that has not been written yet",
    );
  });

  it('flags a condition of nothing but whitespace', () => {
    const { nodes, edges } = whileScope('   ');
    expect(validateScopes(nodes, edges)).toHaveLength(1);
  });

  it('accepts a written condition', () => {
    const { nodes, edges } = whileScope('not converged');
    expect(validateScopes(nodes, edges)).toEqual([]);
  });
});
