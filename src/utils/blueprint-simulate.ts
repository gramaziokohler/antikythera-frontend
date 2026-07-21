import type { Blueprint, BlueprintTask } from '../types/blueprint-schema';
import {
  isSystemTaskType,
  SYSTEM_COMPOSITE_TASK_TYPE,
} from '../types/blueprint-schema';

/** ADR-0003: every non-system task type gets this prefix in a simulated run. */
export const SIMULATION_TYPE_PREFIX = 'simulation.';

/** ADR-0003: the derived blueprint is stored under `{id}__sim`, never the source id. */
export const SIMULATION_ID_SUFFIX = '__sim';

export function deriveSimulationBlueprintId(id: string): string {
  return `${id}${SIMULATION_ID_SUFFIX}`;
}

/** Thrown when a blueprint contains one or more `system.composite` tasks (v1 is unsupported, see ADR-0003). */
export class CompositeTaskNotSupportedError extends Error {
  taskIds: string[];

  constructor(taskIds: string[]) {
    super(
      `Simulate does not support composite tasks yet: ${taskIds.join(', ')}`,
    );
    this.name = 'CompositeTaskNotSupportedError';
    this.taskIds = taskIds;
  }
}

function rewriteTaskType(type: string): string {
  if (isSystemTaskType(type) || type.startsWith(SIMULATION_TYPE_PREFIX)) {
    return type;
  }
  return `${SIMULATION_TYPE_PREFIX}${type}`;
}

/**
 * Derives a simulation blueprint from an authored one: every non-system task
 * type is prefixed with `simulation.`, system types are left alone, and the
 * result is given the derived `{id}__sim` id. The source blueprint object is
 * not mutated. Idempotent — re-deriving from an already-derived blueprint
 * leaves task types unchanged.
 *
 * Throws CompositeTaskNotSupportedError, naming the offending tasks, if the
 * blueprint contains any `system.composite` task.
 */
export function deriveSimulationBlueprint(bp: Blueprint): Blueprint {
  const compositeTaskIds = bp.tasks
    .filter((task) => task.type === SYSTEM_COMPOSITE_TASK_TYPE)
    .map((task) => task.id);
  if (compositeTaskIds.length) {
    throw new CompositeTaskNotSupportedError(compositeTaskIds);
  }

  const tasks: BlueprintTask[] = bp.tasks.map((task) => ({
    ...task,
    type: rewriteTaskType(task.type),
  }));

  return {
    ...bp,
    id: deriveSimulationBlueprintId(bp.id),
    tasks,
  };
}
