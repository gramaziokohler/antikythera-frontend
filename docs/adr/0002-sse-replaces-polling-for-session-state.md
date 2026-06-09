# ADR-0002: Server-Sent Events replace interval polling for session and task state

**Status:** Accepted

## Context

The session monitor polls three REST endpoints every 500ms to track session and task state:
- `GET /sessions/{id}` — session state + full blueprint with embedded task states
- `GET /sessions/{id}/data` — the entire datastore blob
- `GET /sessions/{id}/blueprint/{blueprintId}` — blueprint with task states (a second fetch of similar data)

Sessions run for hours or days. At 500ms, three parallel fetches fire continuously for the entire session lifetime. Tasks can complete in under a second, so multiple state transitions are missed between polls anyway. The polling loop also produces a class of race condition: in-flight responses from a previous interval overwrite state set by a more recent user action (pause/resume), causing the UI to show a state that conflicts with the backend, requiring manual API intervention to recover.

## Decision

Replace the polling loop with a Server-Sent Events stream on a new backend endpoint: `GET /sessions/{id}/stream`.

The stream emits typed, minimal events:
- `task_state_changed` — `{ blueprint_id, task_id, state }`
- `session_state_changed` — `{ state }`
- (future) `scope_iteration_started` — `{ scope_id, iteration, task_ids[] }`

On frontend initial load, fetch the full blueprint snapshot once to build the graph. SSE events then patch only the affected node's status — no re-fetch of the full blueprint on every change.

The datastore (`GET /sessions/{id}/data`) is fetched on demand: once when the session ends, and on explicit user request. It is not part of the SSE stream.

Pause and resume actions apply optimistic state updates immediately on user interaction. The SSE stream confirms or corrects them; it does not drive them.

On SSE reconnection (tab wake, network blip), fetch a fresh full snapshot and re-subscribe to the stream.

## Rationale

- **Eliminates the race condition.** The in-flight overwrite problem disappears: the SSE connection is the single source of state truth, not a parallel interval competing with user actions.
- **Performance over long sessions.** Events are pushed only when state changes. A session where nothing happens for 10 minutes produces zero network traffic, compared to ~3600 fetches at 500ms polling.
- **Subsecond task transitions are visible.** Polling at 500ms misses tasks that complete faster than the interval. SSE delivers state changes as they occur.
- **Datastore decoupled.** The full datastore blob is not needed in real time — it is a review tool. Decoupling it from the state stream eliminates the largest payload from the hot path.

## Consequences

- Backend requires a new SSE endpoint. This is the only backend change required by the frontend refactor.
- The polling `useEffect` in `SessionMonitor` is replaced by a `useSessionStream` hook that manages the SSE `EventSource`, reconnection, and snapshot fetch.
- `transformBlueprintToGraph` must be callable both on initial snapshot load and as an incremental patcher for incoming `task_state_changed` events.
- Browsers that do not support `EventSource` (none in current target set) would need a fallback; no fallback is planned.
