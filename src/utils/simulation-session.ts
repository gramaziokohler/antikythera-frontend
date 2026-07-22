// Per-tab record of which simulated session this tab started, per ADR-0003:
// "Only the tab that started the simulation registers a stand-in agent.
// Other tabs viewing the same session render the graph and register
// nothing." sessionStorage is per-tab and per-origin and survives the
// navigation from the authoring tool entry point to the dashboard's.
const DRIVING_SESSION_KEY = 'antikythera:simulation:driving-session-id';
// The derived blueprint id the session was started from (see AuthorApp's handleSimulate).
// The stand-in needs this — see getDrivingSimulationBlueprintId below.
const DRIVING_SESSION_BLUEPRINT_ID_KEY = 'antikythera:simulation:driving-session-blueprint-id';

export function markDrivingSimulationSession(sessionId: string, blueprintId: string): void {
  sessionStorage.setItem(DRIVING_SESSION_KEY, sessionId);
  sessionStorage.setItem(DRIVING_SESSION_BLUEPRINT_ID_KEY, blueprintId);
}

export function isDrivingSimulationSession(sessionId: string): boolean {
  return sessionStorage.getItem(DRIVING_SESSION_KEY) === sessionId;
}

/**
 * The derived blueprint id this tab started `sessionId` from, or `null` if this tab isn't
 * driving it. The orchestrator gives every task a wire id qualified by its owning blueprint's id
 * (`_create_global_id`: `{blueprint_id}.{task_id}`), but the graph and the breakpoint UI (issue-
 * sim-06) work in terms of the plain per-blueprint task id — SimulationAgent needs this value to
 * translate between the two.
 */
export function getDrivingSimulationBlueprintId(sessionId: string): string | null {
  if (!isDrivingSimulationSession(sessionId)) return null;
  return sessionStorage.getItem(DRIVING_SESSION_BLUEPRINT_ID_KEY);
}
