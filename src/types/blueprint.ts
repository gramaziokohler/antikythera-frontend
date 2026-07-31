/* eslint-disable */
/**
 * This file was automatically generated from blueprint.v1.schema.json.
 * DO NOT EDIT IT BY HAND. Instead, edit the schema on the backend and run
 * `npm run schema:update`. The JSON Schema is the single source of truth for
 * the blueprint data model.
 */

export type TaskInput = TaskIO & {
  /**
   * Key to retrieve the input value from
   */
  get_from?: string;
};
export type TaskOutput = TaskIO & {
  /**
   * Key to set the output value to
   */
  set_to?: string;
};
export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF';
export type TaskState = 'PENDING' | 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'UNSPECIFIED';

/**
 * Schema for Antikythera Blueprint files
 */
export interface Blueprint {
  /**
   * Unique identifier for the blueprint
   */
  id: string;
  /**
   * A human-readable name for the blueprint
   */
  name: string;
  /**
   * The version of the blueprint schema
   */
  version: string;
  /**
   * A human-readable description of the blueprint
   */
  description?: string;
  /**
   * A list of tasks that make up the blueprint
   */
  tasks?: Task[];
}
export interface Task {
  /**
   * Unique identifier for the task
   */
  id: string;
  /**
   * The type of the task
   */
  type: string;
  /**
   * A human-readable description of the task
   */
  description?: string;
  /**
   * A condition expression for the task execution
   */
  condition?: string;
  inputs?: TaskInput[];
  outputs?: TaskOutput[];
  params?: TaskIO[];
  depends_on?: Dependency[];
  state?: TaskState;
  scope_start?: ScopeStart;
  /**
   * Task ID of the scope_start task that this task closes. Marks the end of a scope region.
   */
  scope_end?: string;
}
export interface TaskIO {
  /**
   * Name of the IO item
   */
  name: string;
  /**
   * Value of the IO item (can be any type)
   */
  value?: unknown;
  /**
   * Type of the IO item
   */
  type?: string;
  /**
   * Description of the IO item
   */
  description?: string;
}
export interface Dependency {
  /**
   * ID of the task to depend on
   */
  id: string;
  type?: DependencyType;
}
/**
 * Marks a task as the opening of a scope region. The scope is identified by this task's ID. An optional name can be provided for display purposes.
 */
export interface ScopeStart {
  /**
   * Optional human-readable label for the scope (not used at runtime).
   */
  name?: string;
  retry_policy?: RetryPolicy;
  while_policy?: WhilePolicy;
}
/**
 * Re-runs the scope a fixed number of times after the initial execution.
 */
export interface RetryPolicy {
  /**
   * Number of additional times to re-run the scope after the initial execution.
   */
  retries: number;
  /**
   * Optional backoff configuration between retries (experimental, not yet enforced).
   */
  backoff?: {
    /**
     * Constant delay in milliseconds between retries.
     */
    constant_ms?: number;
  };
}
/**
 * Re-runs the scope as long as a condition evaluates to True.
 */
export interface WhilePolicy {
  /**
   * Expression evaluated against session data after each iteration. Scope loops while this is True.
   */
  condition: string;
  /**
   * Optional cap on the total number of iterations (including the initial run).
   */
  max_iterations?: number;
}
