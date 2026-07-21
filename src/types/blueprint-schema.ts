// Blueprint JSON schema types for the authoring tool

export interface TaskField {
  name: string;
  type?: string;
  value?: unknown;
  description?: string;
}

export interface TaskInput extends TaskField {
  get_from?: string;
}

export interface TaskOutput extends TaskField {
  set_to?: string;
}

export type TaskParam = TaskField;

export interface Dependency {
  id: string;
  type?: 'FS' | 'FF' | 'SS' | 'SF';
}

export interface BlueprintTask {
  id: string;
  type: string;
  description?: string;
  condition?: string;
  inputs?: TaskInput[];
  outputs?: TaskOutput[];
  params?: TaskParam[];
  depends_on?: Dependency[];
}

export interface Blueprint {
  version: string;
  id: string;
  name: string;
  description?: string;
  tasks: BlueprintTask[];
}

// Custom data stored inside each React Flow node
export interface AuthorNodeData extends Record<string, unknown> {
  taskType: string;
  description: string;
  condition: string;
  inputs: TaskInput[];
  outputs: TaskOutput[];
  params: TaskParam[];
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
