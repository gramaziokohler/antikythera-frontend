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

/**
 * The derived id for `id` — idempotent, so deriving from an already-derived blueprint yields the
 * same id rather than stacking suffixes. Simulating a blueprint that came back from a previous
 * simulation is a normal round trip (Simulate → dashboard → Edit → Simulate), not a new
 * blueprint each time.
 */
export function deriveSimulationBlueprintId(id: string): string {
  return id.endsWith(SIMULATION_ID_SUFFIX) ? id : `${id}${SIMULATION_ID_SUFFIX}`;
}

/** The source id a derived blueprint came from. Unwinds however many suffixes have stacked up. */
export function stripSimulationBlueprintId(id: string): string {
  let stripped = id;
  while (stripped.endsWith(SIMULATION_ID_SUFFIX)) {
    stripped = stripped.slice(0, -SIMULATION_ID_SUFFIX.length);
  }
  // A blueprint whose id is nothing *but* the suffix has no source id to recover; keep it as-is
  // rather than handing the authoring tool an empty id.
  return stripped || id;
}

/** The real task type behind a rewritten one. Leaves an un-prefixed type alone. */
export function stripSimulationTypePrefix(type: string): string {
  return type.startsWith(SIMULATION_TYPE_PREFIX) ? type.slice(SIMULATION_TYPE_PREFIX.length) : type;
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
  if (isSystemTaskType(type)) {
    return type;
  }
  // Opting out wins over an already-rewritten type: a task carried back from a previous
  // simulation still reads `simulation.*`, and ticking "use real agent" on it has to undo that
  // rewrite, not be silently outranked by it (issue-sim-05).
  if (isOptedOutOfSimulation(task)) {
    return stripSimulationTypePrefix(type);
  }
  return type.startsWith(SIMULATION_TYPE_PREFIX) ? type : `${SIMULATION_TYPE_PREFIX}${type}`;
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

/**
 * The inverse of `deriveSimulationBlueprint`: undoes the rewrite so a blueprint reads as the one
 * that was authored — source id, real task types, and none of the reserved `__sim_out__` params
 * the derivation injects.
 *
 * Every route into the authoring tool goes through this, because a derived blueprint is an
 * artefact of a run and not a thing to edit. Editing one directly would mean authoring against
 * `simulation.`-prefixed types (which then read as the real type to everything downstream) under
 * an id that grows another `__sim` on every round trip.
 *
 * Lossless in the direction that matters: the authored output *values* live on `task.outputs`,
 * which the derivation preserves and which `deriveSimulationBlueprint` re-derives the
 * `__sim_out__` params from. Safe on a blueprint that was never derived — nothing matches, and
 * it passes through unchanged.
 */
export function stripSimulationDerivation(bp: Blueprint): Blueprint {
  const tasks: BlueprintTask[] = bp.tasks.map((task) => {
    const type = stripSimulationTypePrefix(task.type);
    const params = (task.params ?? []).filter(
      (param) => !param.name.startsWith(SIMULATED_OUTPUT_PARAM_PREFIX),
    );

    const stripped: BlueprintTask = { ...task, type };
    if (params.length) {
      stripped.params = params;
    } else {
      delete stripped.params;
    }
    return stripped;
  });

  return {
    ...bp,
    id: stripSimulationBlueprintId(bp.id),
    tasks,
  };
}
