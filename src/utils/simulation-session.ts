// Per-tab record of which simulated session this tab started, per ADR-0003:
// "Only the tab that started the simulation registers a stand-in agent.
// Other tabs viewing the same session render the graph and register
// nothing." sessionStorage is per-tab and per-origin and survives the
// navigation from the authoring tool entry point to the dashboard's.
const DRIVING_SESSION_KEY = 'antikythera:simulation:driving-session-id';

export function markDrivingSimulationSession(sessionId: string): void {
  sessionStorage.setItem(DRIVING_SESSION_KEY, sessionId);
}

export function isDrivingSimulationSession(sessionId: string): boolean {
  return sessionStorage.getItem(DRIVING_SESSION_KEY) === sessionId;
}
