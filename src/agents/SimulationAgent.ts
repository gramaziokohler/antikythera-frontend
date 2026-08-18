import type { Agent } from './Agent';
import { Task } from './Task';
import { SIMULATED_OUTPUT_PARAM_PREFIX } from '../utils/blueprint-simulate';
import { passthroughAnyData } from './anyDataCodec';

/** ADR-0003: the stand-in agent type. Claims `simulation.*` tasks and nothing else. */
export const SIMULATION_AGENT_TYPE = 'simulation';

/** A point-in-time read of the stand-in's breakpoint/hold state, for `useSimulationAgentState`. */
export interface SimulationAgentSnapshot {
  /** Task ids explicitly marked with a breakpoint (does not include the break-on-every-task flag). */
  breakpoints: Set<string>;
  breakOnEveryTask: boolean;
  /** Task ids currently claimed and held, awaiting `continueHeldTask`. */
  heldTaskIds: string[];
  /** issue-sim-07: artificial per-task delay (ms), applied after claim and before completion. */
  delayMs: number;
}

export const EMPTY_SIMULATION_SNAPSHOT: SimulationAgentSnapshot = {
  breakpoints: new Set(),
  breakOnEveryTask: false,
  heldTaskIds: [],
  delayMs: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HeldTask {
  resolve: (outputs: Record<string, unknown>) => void;
  /** True if the task declares outputs but none were authored — a prompt, not a dead end (ADR-0003). */
  requiresValue: boolean;
}

/**
 * The stand-in agent for ADR-0003 simulation mode. Registered as agent type `simulation`,
 * it claims every `simulation.*` task (via canHandleTool, since it implements no per-tool
 * methods) and completes each one with the simulated outputs carried in its params under the
 * `__sim_out__` prefix (see blueprint-simulate.ts) — unless the task carries a breakpoint (see
 * issue-sim-06), in which case it holds regardless of whether it has an authored default.
 *
 * A task that declares outputs but has none authored is always held, breakpoint or not, per
 * ADR-0003: "A `simulation.*` task with no authored output halts at a breakpoint rather than
 * completing empty." That rule is about an output the author *could* have given a value and
 * didn't — so it turns on the task's declared outputs (the orchestrator's `output_keys`), not on
 * the absence of `__sim_out__` params alone. A task declaring no outputs has nothing for an
 * author to supply and completes with `{}`; holding it would be a prompt with no fields and no
 * way to answer it, since `continueHeldTask` refuses to release a `requiresValue` hold with
 * nothing. `continueHeldTask` releases a hold, breakpointed or not, with author-supplied output
 * values.
 *
 * Breakpoints and holds are in-memory and instance-local by design (ADR-0003: "breakpoints are
 * browser-local to the driving tab"). Reloading the driving tab discards this instance — and with
 * it any breakpoint and any in-flight hold. The task a reload was holding stays `running` on the
 * backend forever (per ADR-0001/ADR-0003, only a task still `READY` is ever redispatched), so
 * recovering it is a manual "Reset task" from the graph's context menu, the same action already
 * used to recover any other stuck task — no bespoke recovery path is implemented here.
 *
 * Breakpoints and held tasks are keyed by the *plain* per-blueprint task id — the id the graph
 * and the breakpoint UI use (see `transformBlueprintToGraph`) — not the wire id a claimed task
 * arrives with. The orchestrator qualifies every task's wire id with its owning blueprint's id
 * (`_create_global_id`: `{blueprint_id}.{task_id}`), so `invokeTool` strips that prefix (given
 * `blueprintId`) before touching any breakpoint/hold state.
 *
 * `setDelayMs` (issue-sim-07) applies one artificial per-task delay, for the whole session, to
 * every task this instance completes without holding — a viewing aid so an unattended
 * simulation doesn't finish faster than the graph can be read. It is never a prediction of the
 * task's real duration. The wait happens inside `invokeTool`, i.e. strictly after claiming
 * (which happens in `AgentLauncher.handleTaskStart` before `invokeTool` is ever called) and
 * before completion, so a delayed task is never left in `READY` for `RedispatchPoller` to fail.
 */
export class SimulationAgent implements Agent {
  type = SIMULATION_AGENT_TYPE;

  private breakpoints = new Set<string>();
  private breakOnEveryTask = false;
  private held = new Map<string, HeldTask>();
  private listeners = new Set<() => void>();
  private snapshot: SimulationAgentSnapshot = EMPTY_SIMULATION_SNAPSHOT;
  private readonly blueprintId?: string;
  private delayMs = 0;

  /**
   * @param blueprintId The derived blueprint id this agent's session was started from (see
   * `getDrivingSimulationBlueprintId`). Optional so existing unit tests that fabricate their own
   * already-plain task ids need no changes; production callers (`useSimulationStandIn`) always
   * supply it.
   */
  constructor(blueprintId?: string) {
    this.blueprintId = blueprintId;
  }

  canHandleTool(): boolean {
    return true;
  }

  /** Strips this agent's `{blueprintId}.` prefix off a wire task id, if present. */
  private toGraphTaskId(wireTaskId: string): string {
    if (!this.blueprintId) return wireTaskId;
    const prefix = `${this.blueprintId}.`;
    return wireTaskId.startsWith(prefix) ? wireTaskId.slice(prefix.length) : wireTaskId;
  }

  /** Subscribes to breakpoint/hold state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A cached, referentially-stable snapshot — safe to use as a `useSyncExternalStore` getSnapshot. */
  getSnapshot(): SimulationAgentSnapshot {
    return this.snapshot;
  }

  private notify(): void {
    this.snapshot = {
      breakpoints: new Set(this.breakpoints),
      breakOnEveryTask: this.breakOnEveryTask,
      heldTaskIds: [...this.held.keys()],
      delayMs: this.delayMs,
    };
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Sets the artificial per-task delay (ms) applied to every subsequent task this stand-in
   * completes without holding. Distinct from a task's real duration, which no simulation
   * attempts to predict (see ADR-0003 / CONTEXT.md's "Simulation delay" glossary entry).
   * Adjustable while the session is running — takes effect on the next task claimed, not
   * retroactively on one already waiting.
   */
  setDelayMs(delayMs: number): void {
    this.delayMs = Math.max(0, delayMs);
    this.notify();
  }

  getDelayMs(): number {
    return this.delayMs;
  }

  toggleBreakpoint(taskId: string): void {
    if (this.breakpoints.has(taskId)) {
      this.breakpoints.delete(taskId);
    } else {
      this.breakpoints.add(taskId);
    }
    this.notify();
  }

  /** Whether claiming `taskId` should hold — an explicit breakpoint, or "break on every task". */
  isBreakpointed(taskId: string): boolean {
    return this.breakOnEveryTask || this.breakpoints.has(taskId);
  }

  setBreakOnEveryTask(enabled: boolean): void {
    this.breakOnEveryTask = enabled;
    this.notify();
  }

  /** True if `taskId` is currently claimed and held, awaiting `continueHeldTask`. */
  isHeld(taskId: string): boolean {
    return this.held.has(taskId);
  }

  /** True if the hold at `taskId` declares outputs none of which were authored, so it cannot continue with `{}`. */
  requiresValue(taskId: string): boolean {
    return this.held.get(taskId)?.requiresValue ?? false;
  }

  async invokeTool(_toolName: string, task: Task): Promise<Record<string, unknown>> {
    const graphTaskId = this.toGraphTaskId(task.id);
    const rawParams = task.getRawParams();
    const authoredOutputs: Record<string, unknown> = {};
    for (const [key, anyData] of Object.entries(rawParams)) {
      if (key.startsWith(SIMULATED_OUTPUT_PARAM_PREFIX)) {
        authoredOutputs[key.substring(SIMULATED_OUTPUT_PARAM_PREFIX.length)] = passthroughAnyData(anyData);
      }
    }
    const hasAuthoredOutput = Object.keys(authoredOutputs).length > 0;
    // Only a task that declares an output can be missing an authored value for one. A task
    // declaring none completes with `{}` rather than holding for a value it has no field for.
    const awaitsAuthoredValue = task.outputKeys.length > 0 && !hasAuthoredOutput;

    if (!this.isBreakpointed(graphTaskId) && !awaitsAuthoredValue) {
      // Applied after AgentLauncher.handleTaskStart's claim (already happened by the time
      // invokeTool runs) and before completion — never before the claim, so a delayed task is
      // never left in READY for RedispatchPoller to fail (issue-sim-07).
      if (this.delayMs > 0) {
        await sleep(this.delayMs);
      }
      return authoredOutputs;
    }

    return new Promise<Record<string, unknown>>((resolve) => {
      this.held.set(graphTaskId, { resolve, requiresValue: awaitsAuthoredValue });
      this.notify();
    });
  }

  /**
   * Releases a held task, completing it with `outputs` — plain JS values from the breakpoint
   * editor (see SimulationBreakpointPanel.tsx), encoded fresh by `AgentLauncher.completeTask`
   * rather than forwarded as a passthrough, since there is no longer a single original wire value
   * to forward once the author may have edited it. A task held for want of an authored output
   * (`requiresValue`) cannot be continued with nothing — the caller must supply at least one
   * output value.
   */
  continueHeldTask(taskId: string, outputs: Record<string, unknown>): void {
    const heldTask = this.held.get(taskId);
    if (!heldTask) return;
    if (heldTask.requiresValue && Object.keys(outputs).length === 0) return;

    this.held.delete(taskId);
    this.breakpoints.delete(taskId);
    heldTask.resolve(outputs);
    this.notify();
  }
}
