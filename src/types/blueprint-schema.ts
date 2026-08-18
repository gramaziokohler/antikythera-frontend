// Authoring-tool view over the blueprint data model.
//
// The blueprint data model itself is defined once, in ./blueprint.ts, which is
// generated from src/schemas/blueprint.v1.schema.json — the single source of
// truth shared with the backend. This module only re-exports those canonical
// types and adds types that exist purely for the editor UI (React Flow node
// data, toolbar metadata). Do not redeclare any blueprint field here.

export type {
  Blueprint,
  Task,
  TaskIO,
  TaskInput,
  TaskOutput,
  Dependency,
  DependencyType,
  TaskState,
  ScopeStart,
  RetryPolicy,
  WhilePolicy,
} from './blueprint';

import type { TaskInput, TaskOutput, TaskIO, ScopeStart } from './blueprint';

// Params carry no extra fields beyond the shared TaskIO shape; this alias just
// keeps authoring code readable.
export type TaskParam = TaskIO;

// Custom data stored inside each React Flow node. Mirrors the fields of a
// canonical Task, but flattened/renamed for the editor (e.g. `taskType`) and
// carrying scope membership so it survives an import → export round-trip.
export interface AuthorNodeData extends Record<string, unknown> {
  taskType: string;
  description: string;
  condition: string;
  inputs: TaskInput[];
  outputs: TaskOutput[];
  params: TaskParam[];
  // Present when this task opens a scope; holds the raw scope_start policy.
  scopeStart?: ScopeStart;
  // Present when this task closes a scope; the id of the scope_start task.
  scopeEnd?: string;
}

export interface BlueprintMeta {
  id: string;
  name: string;
  version: string;
  description: string;
}

export const KNOWN_TASK_TYPES: string[] = [
  'system.start',
  'system.end',
  'system.sleep',
  'system.composite',
  'user_interaction.user_input',
  'user_interaction.user_output',
  'user_interaction.notification',
];

// System task types are structurally load-bearing in the orchestrator (see
// ADR-0003) and are never rewritten by Simulate. Everything that needs to
// know "is this a system type" — the Simulate rewrite, blueprint validation,
// node-deletability rules — reads from these instead of repeating literals.
export const SYSTEM_START_TASK_TYPE = 'system.start';
export const SYSTEM_END_TASK_TYPE = 'system.end';
export const SYSTEM_COMPOSITE_TASK_TYPE = 'system.composite';
export const SYSTEM_SLEEP_TASK_TYPE = 'system.sleep';

export const SYSTEM_TASK_TYPES = [
  SYSTEM_START_TASK_TYPE,
  SYSTEM_END_TASK_TYPE,
  SYSTEM_COMPOSITE_TASK_TYPE,
  SYSTEM_SLEEP_TASK_TYPE,
] as const;

export function isSystemTaskType(type: string): boolean {
  return (SYSTEM_TASK_TYPES as readonly string[]).includes(type);
}
