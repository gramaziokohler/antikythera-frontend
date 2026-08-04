import type { Edge, Node } from '@xyflow/react';
import type { AuthorNodeData, ScopeStart } from '../types/blueprint-schema';

/**
 * Scope derivation for the authoring canvas.
 *
 * A scope has no object of its own in the blueprint: it exists as a `scope_start`
 * policy on the task that opens it plus a `scope_end` back-reference on the task
 * that closes it, and its membership is *implied by the DAG* — every task both
 * reachable from the opener and able to reach the closer.
 *
 * That is why the editor never asks the author to list scope members: it derives
 * them exactly the way `Blueprint._build_scopes` does on the backend, so the box
 * drawn on the canvas is the region the orchestrator will actually reset and
 * re-run. The checks in `validateScopes` mirror `Blueprint._validate_scopes` for
 * the same reason — a scope the editor accepts must survive upload.
 */

/** Prefix marking a derived scope frame, to tell it apart from a task node. */
export const SCOPE_NODE_PREFIX = 'scope-';

export function isScopeNodeId(id: string): boolean {
  return id.startsWith(SCOPE_NODE_PREFIX);
}

export type ScopePolicyType = 'skip' | 'retry' | 'while';

export interface EditorScope {
  /** The opening task's id — a scope's identity, as on the backend. */
  id: string;
  label: string;
  startId: string;
  endId: string;
  /** Every task in the region, start and end included. */
  taskIds: string[];
  policyType: ScopePolicyType;
  policy: ScopeStart;
  /** How many other scopes fully contain this one. Drives frame padding. */
  depth: number;
}

function nodeData(node: Node): AuthorNodeData {
  return node.data as AuthorNodeData;
}

/* ------------------------------------------------------------------ */
/*  Graph reachability                                                 */
/* ------------------------------------------------------------------ */

interface Adjacency {
  successors: Map<string, Set<string>>;
  predecessors: Map<string, Set<string>>;
}

function buildAdjacency(edges: Edge[]): Adjacency {
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!successors.has(edge.source)) successors.set(edge.source, new Set());
    successors.get(edge.source)!.add(edge.target);
    if (!predecessors.has(edge.target)) predecessors.set(edge.target, new Set());
    predecessors.get(edge.target)!.add(edge.source);
  }
  return { successors, predecessors };
}

function reachable(origin: string, adjacency: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const queue = [origin];
  while (queue.length) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) queue.push(next);
  }
  return visited;
}

/** The tasks a scope spans: reachable forward from *startId* ∩ backward from *endId*. */
export function scopeRegion(startId: string, endId: string, edges: Edge[]): string[] {
  const { successors, predecessors } = buildAdjacency(edges);
  const forward = reachable(startId, successors);
  const backward = reachable(endId, predecessors);
  return [...forward].filter((id) => backward.has(id)).sort();
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Policy shape                                                       */
/* ------------------------------------------------------------------ */

export function policyTypeOf(policy: ScopeStart | undefined): ScopePolicyType {
  if (policy?.retry_policy) return 'retry';
  if (policy?.while_policy) return 'while';
  return 'skip';
}

/** Short policy text for the frame's label chip, e.g. `3x` or `not done (max 10)`. */
export function describePolicy(policy: ScopeStart | undefined): string {
  switch (policyTypeOf(policy)) {
    case 'retry': {
      const retries = policy?.retry_policy?.retries;
      return retries === undefined ? '' : `${retries}x`;
    }
    case 'while': {
      const { condition, max_iterations: max } = policy?.while_policy ?? {};
      const summary = condition ?? '';
      return (max ? `${summary} (max ${max})` : summary).trim();
    }
    default:
      return '';
  }
}

/**
 * Rewrite a policy to a different type, carrying over what still applies.
 *
 * Only one of `retry_policy` / `while_policy` may be set — `policyTypeOf` and the
 * backend both resolve retry first, so leaving a stale key behind would silently
 * change which policy runs. Switching therefore drops the other key entirely.
 */
export function withPolicyType(policy: ScopeStart, type: ScopePolicyType): ScopeStart {
  const next: ScopeStart = {};
  if (policy.name) next.name = policy.name;
  if (type === 'retry') {
    next.retry_policy = policy.retry_policy ?? { retries: 1 };
  } else if (type === 'while') {
    next.while_policy = policy.while_policy ?? { condition: '' };
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  Derivation from the canvas                                         */
/* ------------------------------------------------------------------ */

/**
 * Every complete scope on the canvas.
 *
 * An opener with no closer is skipped rather than drawn: its region is undefined
 * until it is paired. `validateScopes` reports it so it still blocks save.
 */
export function deriveScopes(nodes: Node[], edges: Edge[]): EditorScope[] {
  const closers = new Map<string, string>(); // opener id -> closer id
  for (const node of nodes) {
    const scopeEnd = nodeData(node).scopeEnd;
    if (scopeEnd && !closers.has(scopeEnd)) closers.set(scopeEnd, node.id);
  }

  const scopes: EditorScope[] = [];
  for (const node of nodes) {
    const policy = nodeData(node).scopeStart;
    if (policy === undefined) continue;
    const endId = closers.get(node.id);
    if (!endId) continue;
    scopes.push({
      id: node.id,
      startId: node.id,
      endId,
      label: policy.name?.trim() || node.id,
      taskIds: scopeRegion(node.id, endId, edges),
      policyType: policyTypeOf(policy),
      policy,
      depth: 0,
    });
  }

  // Depth = how many other scopes fully contain this one, so nested frames can be
  // inset and stacked rather than drawn on top of each other.
  const regions = scopes.map((scope) => new Set(scope.taskIds));
  scopes.forEach((scope, i) => {
    scope.depth = regions.filter((other, j) => j !== i && isSubset(regions[i], other)).length;
  });

  return scopes;
}

export function findScope(scopes: EditorScope[], scopeId: string | null): EditorScope | null {
  if (!scopeId) return null;
  return scopes.find((scope) => scope.id === scopeId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Structural problems with the scopes on the canvas. Mirrors `Blueprint._validate_scopes`. */
export function validateScopes(nodes: Node[], edges: Edge[]): string[] {
  const errors: string[] = [];
  const taskIds = new Set(nodes.map((n) => n.id));
  const openers = new Set(nodes.filter((n) => nodeData(n).scopeStart !== undefined).map((n) => n.id));
  const closers = new Map<string, string>();

  for (const node of nodes) {
    const scopeEnd = nodeData(node).scopeEnd;
    if (!scopeEnd) continue;
    if (!taskIds.has(scopeEnd)) {
      errors.push(`Task '${node.id}' closes scope '${scopeEnd}', which no longer exists`);
    } else if (!openers.has(scopeEnd)) {
      errors.push(`Task '${node.id}' closes scope '${scopeEnd}', but that task does not open one`);
    } else if (closers.has(scopeEnd)) {
      errors.push(`Scope '${scopeEnd}' is closed twice, by '${closers.get(scopeEnd)}' and '${node.id}'`);
    } else {
      closers.set(scopeEnd, node.id);
    }
  }

  for (const opener of openers) {
    if (!closers.has(opener)) errors.push(`Scope '${opener}' has no closing task`);
  }

  const scopes = deriveScopes(nodes, edges);

  // A while-policy with no condition is rejected by the orchestrator on upload —
  // it parses the expression, and the empty string is a syntax error — which
  // would surface as a failed Save long after the scope was created. Selecting
  // "While" seeds an empty condition, so this is one Enter away from happening.
  for (const scope of scopes) {
    if (scope.policyType === 'while' && !scope.policy.while_policy?.condition?.trim()) {
      errors.push(`Scope '${scope.label}' loops while a condition that has not been written yet`);
    }
  }

  for (let i = 0; i < scopes.length; i++) {
    for (let j = i + 1; j < scopes.length; j++) {
      const a = new Set(scopes[i].taskIds);
      const b = new Set(scopes[j].taskIds);
      if (overlaps(a, b) && !isSubset(a, b) && !isSubset(b, a)) {
        errors.push(`Scopes '${scopes[i].label}' and '${scopes[j].label}' overlap without nesting`);
      }
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/*  Grouping a selection                                               */
/* ------------------------------------------------------------------ */

export interface ScopeBoundary {
  startId: string;
  endId: string;
  /** The full region, which may include tasks the author did not select. */
  taskIds: string[];
  /** Tasks pulled in because they sit between the entry and exit tasks. */
  implied: string[];
}

export type ScopeBoundaryResult =
  | { boundary: ScopeBoundary; error: null }
  | { boundary: null; error: string };

function fail(error: string): ScopeBoundaryResult {
  return { boundary: null, error };
}

/**
 * Work out which tasks would open and close a scope around *selectedIds*.
 *
 * The author selects a region; the entry task (the only one with no selected
 * predecessor) and exit task (no selected successor) fall out of the graph. A
 * selection with two entries has no single task to hang the policy on, so it is
 * rejected here rather than producing a scope whose region differs from what was
 * selected.
 */
export function deriveScopeBoundary(
  selectedIds: string[],
  nodes: Node[],
  edges: Edge[],
): ScopeBoundaryResult {
  const selected = new Set(selectedIds);
  if (selected.size < 2) {
    return fail('Select at least two connected tasks to group into a scope');
  }

  const { successors, predecessors } = buildAdjacency(edges);

  // The entry task is the one every other selected task descends from — tested
  // against full ancestry, not just direct edges, so selecting the two ends of a
  // path is enough to describe the region between them.
  const outermost = (adjacency: Map<string, Set<string>>) =>
    selectedIds.filter((id) => {
      const beyond = reachable(id, adjacency);
      return !selectedIds.some((other) => other !== id && beyond.has(other));
    });

  const entries = outermost(predecessors);
  const exits = outermost(successors);

  if (entries.length !== 1) {
    return fail(
      `A scope needs a single entry task, but '${entries.join("', '")}' each start their own branch — select tasks that form one region of the graph`,
    );
  }
  if (exits.length !== 1) {
    return fail(
      `A scope needs a single exit task, but '${exits.join("', '")}' each end their own branch — select tasks that form one region of the graph`,
    );
  }

  const startId = entries[0];
  const endId = exits[0];
  if (startId === endId) {
    return fail('A scope must span at least two connected tasks');
  }

  const taskIds = scopeRegion(startId, endId, edges);
  const region = new Set(taskIds);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (nodeData(byId.get(startId)!).scopeStart !== undefined) {
    return fail(`Task '${startId}' already opens a scope`);
  }
  if (nodeData(byId.get(endId)!).scopeEnd) {
    return fail(`Task '${endId}' already closes a scope`);
  }

  for (const scope of deriveScopes(nodes, edges)) {
    const other = new Set(scope.taskIds);
    if (overlaps(region, other) && !isSubset(region, other) && !isSubset(other, region)) {
      return fail(`This selection overlaps scope '${scope.label}' without nesting inside it`);
    }
  }

  return {
    boundary: { startId, endId, taskIds, implied: taskIds.filter((id) => !selected.has(id)) },
    error: null,
  };
}

/**
 * Remove tasks, taking any scope marker they leave dangling with them.
 *
 * A scope whose entry or exit task is gone has no region left, so the surviving
 * half of the pair is dropped rather than left as a marker nothing can pair with.
 * Every deletion route — the edit panel, the Delete key — goes through here, so a
 * scope cannot be broken by picking the right way to delete a task.
 */
export function withoutTasks(nodes: Node[], removedIds: string[]): Node[] {
  const removed = new Set(removedIds);
  const orphanedOpeners = new Set(
    nodes
      .filter((node) => removed.has(node.id))
      .map((node) => nodeData(node).scopeEnd)
      .filter((id): id is string => !!id),
  );

  return nodes
    .filter((node) => !removed.has(node.id))
    .map((node) => {
      const data = nodeData(node);
      const dropEnd = !!data.scopeEnd && removed.has(data.scopeEnd);
      const dropStart = data.scopeStart !== undefined && orphanedOpeners.has(node.id);
      if (!dropEnd && !dropStart) return node;
      const next = { ...data };
      if (dropEnd) delete next.scopeEnd;
      if (dropStart) delete next.scopeStart;
      return { ...node, data: next };
    });
}

/* ------------------------------------------------------------------ */
/*  Frame geometry                                                     */
/* ------------------------------------------------------------------ */

export interface ScopeFrame {
  scope: EditorScope;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FRAME_PADDING = 30;
const NESTING_INSET = 14;
const MIN_FRAME_PADDING = 8;

/**
 * Bounding boxes for the scope frames, ordered outermost first so they stack.
 *
 * Recomputed from live node positions rather than stored, so dragging a task in
 * or out of a scope's span redraws the frame immediately.
 */
export function scopeFrames(
  scopes: EditorScope[],
  nodes: Node[],
  fallbackSize: { width: number; height: number },
): ScopeFrame[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return [...scopes]
    .sort((a, b) => a.depth - b.depth)
    .flatMap((scope) => {
      const members = scope.taskIds.map((id) => byId.get(id)).filter((n): n is Node => !!n);
      if (!members.length) return [];

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const member of members) {
        const width = member.measured?.width ?? fallbackSize.width;
        const height = member.measured?.height ?? fallbackSize.height;
        minX = Math.min(minX, member.position.x);
        minY = Math.min(minY, member.position.y);
        maxX = Math.max(maxX, member.position.x + width);
        maxY = Math.max(maxY, member.position.y + height);
      }

      // A nested scope's box sits inside its parent's, so it is drawn tighter —
      // otherwise equal padding would put the two borders on top of each other.
      const padding = Math.max(MIN_FRAME_PADDING, FRAME_PADDING - scope.depth * NESTING_INSET);
      return [
        {
          scope,
          x: minX - padding,
          y: minY - padding,
          width: maxX - minX + padding * 2,
          height: maxY - minY + padding * 2,
        },
      ];
    });
}
