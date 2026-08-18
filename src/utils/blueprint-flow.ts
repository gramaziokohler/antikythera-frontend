import { Position, MarkerType } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { getLayoutedElements } from './flow-layout';
import type {
  AuthorNodeData,
  Blueprint,
  BlueprintMeta,
  Task,
  TaskIO,
} from '../types/blueprint-schema';
import {
  SYSTEM_START_TASK_TYPE,
  SYSTEM_END_TASK_TYPE,
} from '../types/blueprint-schema';

/**
 * Serialization between the canonical Blueprint data model and the React Flow
 * node/edge representation the editor renders.
 *
 * This is the editor's boundary to the shared data model: everything the model
 * carries — including scope_start / scope_end — must survive a
 * blueprintToFlow → flowToBlueprint round-trip, otherwise opening and exporting
 * a blueprint silently drops fields the editor doesn't surface yet.
 */

export function makeEdgeId(source: string, target: string) {
  return `${source}->${target}`;
}

/**
 * Moves a declared type onto `type_hint`, the field the data model actually
 * carries, and drops the deprecated `type` alias.
 *
 * Every blueprint reaching the editor passes through here — opened from a file,
 * fetched from the orchestrator (already normalised by blueprint-load), or
 * hand-written — so the editor works with exactly one type field from this point
 * on, rather than having to guess which of the two a given task used.
 */
function canonicalizeTypeHint<T extends TaskIO>(field: T): T {
  const { type, ...rest } = field;
  const type_hint = field.type_hint ?? type;
  return (type_hint ? { ...rest, type_hint } : rest) as T;
}

export function blueprintToFlow(bp: Blueprint): { nodes: Node[]; edges: Edge[] } {
  const tasks = bp.tasks ?? [];
  const nodes: Node[] = tasks.map((task) => ({
    id: task.id,
    type: 'authorTask',
    position: { x: 0, y: 0 },
    data: {
      taskType: task.type,
      description: task.description ?? '',
      condition: task.condition ?? '',
      inputs: (task.inputs ?? []).map(canonicalizeTypeHint),
      outputs: (task.outputs ?? []).map(canonicalizeTypeHint),
      params: (task.params ?? []).map(canonicalizeTypeHint),
      // Preserve scope membership so it survives an import → export round-trip.
      ...(task.scope_start !== undefined ? { scopeStart: task.scope_start } : {}),
      ...(task.scope_end !== undefined ? { scopeEnd: task.scope_end } : {}),
    } satisfies AuthorNodeData,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    deletable: task.type !== SYSTEM_START_TASK_TYPE && task.type !== SYSTEM_END_TASK_TYPE,
  }));

  const edges: Edge[] = [];
  tasks.forEach((task) => {
    (task.depends_on ?? []).forEach((dep) => {
      edges.push({
        id: makeEdgeId(dep.id, task.id),
        source: dep.id,
        target: task.id,
        type: 'deletable',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
      });
    });
  });

  // Apply Dagre layout so imported blueprints render cleanly
  return getLayoutedElements(nodes, edges);
}

export function flowToBlueprint(
  nodes: Node[],
  edges: Edge[],
  meta: BlueprintMeta,
): Blueprint {
  const tasks: Task[] = nodes.map((node) => {
    const d = node.data as AuthorNodeData;

    const depends_on = edges
      .filter((e) => e.target === node.id)
      .map((e) => ({ id: e.source }));

    const task: Task = { id: node.id, type: d.taskType };
    if (d.description) task.description = d.description;
    if (d.condition) task.condition = d.condition;

    const inputs = d.inputs.filter((f) => f.name.trim());
    const outputs = d.outputs.filter((f) => f.name.trim());
    const params = d.params.filter((f) => f.name.trim());

    if (inputs.length) task.inputs = inputs;
    if (outputs.length) task.outputs = outputs;
    if (params.length) task.params = params;
    if (depends_on.length) task.depends_on = depends_on;

    // Round-trip scope boundaries. Both are preserved whenever defined rather
    // than when truthy: scope_start may legitimately be an empty object (a
    // skip-policy scope), and an empty scope_end is a value the schema accepts,
    // so dropping either would break the round-trip guarantee above.
    if (d.scopeStart !== undefined) task.scope_start = d.scopeStart;
    if (d.scopeEnd !== undefined) task.scope_end = d.scopeEnd;

    return task;
  });

  const bp: Blueprint = {
    version: meta.version || '1.0',
    id: meta.id,
    name: meta.name,
    tasks,
  };
  if (meta.description) bp.description = meta.description;
  return bp;
}
