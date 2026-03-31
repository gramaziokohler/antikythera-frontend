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
