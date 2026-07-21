import type { Blueprint, BlueprintTask, TaskOutput, TaskParam } from '../types/blueprint-schema';
import {
  isSystemTaskType,
  SYSTEM_COMPOSITE_TASK_TYPE,
} from '../types/blueprint-schema';

/** ADR-0003: every non-system task type gets this prefix in a simulated run. */
export const SIMULATION_TYPE_PREFIX = 'simulation.';

/** ADR-0003: the derived blueprint is stored under `{id}__sim`, never the source id. */
export const SIMULATION_ID_SUFFIX = '__sim';

/**
 * Reserved param name prefix carrying an authored output value to the stand-in agent (see
 * SimulationAgent.ts). Unambiguous enough that the stand-in can tell a simulated output from a
 * real param the task legitimately carries.
 */
export const SIMULATED_OUTPUT_PARAM_PREFIX = '__sim_out__';

export function simulatedOutputParamName(outputName: string): string {
  return `${SIMULATED_OUTPUT_PARAM_PREFIX}${outputName}`;
}

/**
 * Reserved param name marking a task as opted out of simulation (ADR-0003: "Tasks may opt out
 * via a per-task toggle in the authoring tool, keeping their real type so a real agent claims
 * them"). Lives as an ordinary param on the *source* task so it round-trips through Save/Open
 * like any other authored data, and is inert in a real run — nothing reads this param name.
 */
export const SIMULATION_OPT_OUT_PARAM_NAME = '__sim_use_real_agent__';

/** True if `params` carries the opt-out flag. Operates on a bare param list so both the
 * derive-time rewrite and the authoring-tool panel (which only has `AuthorNodeData.params`,
 * not a full `BlueprintTask`) can share one check. */
export function isOptedOutParams(params: TaskParam[] | undefined): boolean {
  return (params ?? []).some(
    (p) => p.name === SIMULATION_OPT_OUT_PARAM_NAME && p.value === true,
  );
}

export function isOptedOutOfSimulation(task: BlueprintTask): boolean {
  return isOptedOutParams(task.params);
}

/** Adds or removes the opt-out param, preserving every other param untouched. */
export function setOptedOutOfSimulation(
  params: TaskParam[] | undefined,
  optedOut: boolean,
): TaskParam[] {
  const rest = (params ?? []).filter((p) => p.name !== SIMULATION_OPT_OUT_PARAM_NAME);
  return optedOut ? [...rest, { name: SIMULATION_OPT_OUT_PARAM_NAME, value: true }] : rest;
}

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

function rewriteTaskType(task: BlueprintTask): string {
  const { type } = task;
  if (
    isSystemTaskType(type) ||
    type.startsWith(SIMULATION_TYPE_PREFIX) ||
    isOptedOutOfSimulation(task)
  ) {
    return type;
  }
  return `${SIMULATION_TYPE_PREFIX}${type}`;
}

/** One reserved param per authored output value, so it reaches the stand-in agent as a param. */
function simulatedOutputParams(outputs: TaskOutput[] | undefined): TaskParam[] {
  return (outputs ?? [])
    .filter((output) => output.value !== undefined)
    .map((output) => ({ name: simulatedOutputParamName(output.name), value: output.value }));
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

  const tasks: BlueprintTask[] = bp.tasks.map((task) => {
    const type = rewriteTaskType(task);
    // Only tasks actually rewritten to simulation.* need their outputs carried as params —
    // this also keeps the rewrite idempotent (re-deriving an already-derived task, whose type
    // does not change here, does not re-copy or duplicate the params).
    if (type === task.type) {
      return { ...task, type };
    }
    const extraParams = simulatedOutputParams(task.outputs);
    if (!extraParams.length) {
      return { ...task, type };
    }
    return { ...task, type, params: [...(task.params ?? []), ...extraParams] };
  });

  return {
    ...bp,
    id: deriveSimulationBlueprintId(bp.id),
    tasks,
  };
}
