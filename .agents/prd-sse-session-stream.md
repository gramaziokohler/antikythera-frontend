# PRD: Replace Polling with SSE for Session and Task State

**Status:** Ready for implementation  
**ADR:** [ADR-0002](../docs/adr/0002-sse-replaces-polling-for-session-state.md)

---

## Problem Statement

The session monitor continuously polls three REST endpoints every 500ms to track session and task state throughout the lifetime of a session. Sessions can run for hours or days. This creates several compounding problems:

- **Wasted traffic over long sessions.** At 500ms intervals, three parallel fetches fire continuously — even when nothing changes. A session idle for 10 minutes generates ~3600 unnecessary HTTP requests.
- **Missed transitions.** Tasks can complete in under a second. Polling at any fixed interval guarantees some transitions are invisible to the UI; nodes jump from `pending` to `succeeded` with no intermediate `running` state shown.
- **A race condition users have hit in practice.** Responses from a previous polling interval can arrive after a user has paused or resumed a session, overwriting the correct state with a stale one. Recovering requires manual API intervention.
- **A configurable poll interval as a workaround.** The current settings panel exposes a poll-interval slider (250ms–5000ms) — a user-visible knob for a problem that should not exist.

## Solution

Replace the polling loop in `SessionMonitor` with a Server-Sent Events (SSE) stream on a new backend endpoint: `GET /sessions/{id}/stream`.

On session open, fetch the full blueprint snapshot once to build the graph. From that point forward, SSE events patch only the affected node's status. Pause and resume use optimistic updates; the stream confirms or corrects them. On reconnect (tab wake, network blip), re-fetch a fresh snapshot and re-subscribe. The datastore is fetched on demand (when the session ends or on explicit user request), not as part of the stream.

## User Stories

1. As a session operator, I want task state transitions to appear in the graph immediately when they occur, so that I can follow a fast-running session without missing transitions.
2. As a session operator, I want pausing a session to take effect in the UI immediately, so that I am not confused by the UI reverting to "running" a moment later.
3. As a session operator, I want resuming a session to take effect in the UI immediately, so that I have confidence my action was registered.
4. As a session operator, I want the session monitor to stop producing network traffic when nothing is changing, so that my browser is not unnecessarily burdened during long-running idle sessions.
5. As a session operator, I want the session monitor to automatically reconnect after a network blip or tab wake, so that I do not have to manually refresh to get current state.
6. As a session operator, I want the graph to show the correct state after reconnecting, so that I am not looking at stale task statuses.
7. As a session operator, I want task transitions to be visible even for sub-500ms tasks, so that I can see that a task ran and succeeded rather than jumping from pending to completed.
8. As a session operator, I want the session state badge to update in real time when the session transitions to `completed` or `failed`, so that I know when to review outputs without polling manually.
9. As a session operator, I want the datastore panel to remain available on demand after the session ends, so that I can review outputs without it being auto-refreshed on every poll cycle.
10. As a session operator, I want to navigate into a composite task's inner blueprint and have task states update via SSE, so that the SSE stream works correctly at any depth of the blueprint stack.
11. As a session operator, I want the session monitor to gracefully degrade if the SSE connection cannot be established, so that I receive a clear error rather than a silently stale view.
12. As a session operator, I want the poll-interval settings panel to be removed from the UI, so that the interface is not cluttered with controls for a problem that has been solved.
13. As a developer watching the Network tab, I want to see a single long-lived SSE connection instead of dozens of short fetches, so that I can easily inspect what state changes are arriving.

## Implementation Decisions

### New `useSessionStream` hook

The polling `useEffect` in `SessionMonitor` is replaced by a `useSessionStream` hook. The hook owns the `EventSource` lifecycle: opening, message handling, reconnection on error, and teardown on unmount. It accepts `sessionId` and `apiBaseUrl` and exposes the current `sessionState`, a setter for `graphData`, and a `reconnect` trigger.

The hook follows this lifecycle:
1. Fetch full blueprint snapshot via `GET /sessions/{id}/blueprint` → build initial `graphData` and `sessionState`.
2. Open `EventSource` on `GET /sessions/{id}/stream`.
3. On `task_state_changed { blueprint_id, task_id, state }`: patch the affected node in `graphData` if `blueprint_id` matches the currently visible blueprint; ignore otherwise (different depth in the blueprint stack).
4. On `session_state_changed { state }`: update `sessionState`.
5. On `EventSource` error: close, wait a brief back-off, re-fetch snapshot, re-open stream (same as initial load).
6. On unmount / session change: close `EventSource`.

### Optimistic state updates for pause/resume

`handlePause` sets `sessionState` to `"paused"` immediately before the POST fires. `handleResume` sets it to `"running"`. The SSE stream confirms or corrects these; it does not drive them. This eliminates the need to bump a `pollingKey` state to restart polling after a resume.

### Blueprint stack depth and SSE events

When the user has drilled into a composite task's inner blueprint, incoming `task_state_changed` events carry a `blueprint_id`. The hook compares this against the currently visible blueprint's ID and only patches the graph when they match. Events for other blueprints are buffered or discarded (initial implementation: discard; buffering is out of scope).

### `transformBlueprintToGraph` remains the canonical snapshot builder

The function already exists in `SessionMonitor`. It is called on initial snapshot load (unchanged), and is not called per-event — individual events patch `graphData` directly by mutating the relevant node's `status` field using React state update functions.

### Datastore fetching

The datastore is no longer fetched on every poll cycle. It is fetched once when the stream delivers a `session_state_changed` event with `state: "completed"` or `state: "failed"`. The existing "Download Data" button and on-demand refresh remain unchanged.

### Settings panel removal

The configurable poll-interval panel (the `showSettings` / `pollInterval` state and the `localStorage` key `antikythera.pollInterval`) is removed entirely. The `pollingKey` state and the `setPollingKey` call in `handleResume` are also removed.

### Backend SSE endpoint contract

```
GET /sessions/{id}/stream
Content-Type: text/event-stream

event: task_state_changed
data: {"blueprint_id": "...", "task_id": "...", "state": "running"}

event: session_state_changed
data: {"state": "completed"}
```

The backend must implement this endpoint. No other backend changes are required by the frontend.

### No fallback for missing `EventSource`

All browsers in the target deployment environment support `EventSource` natively. No polyfill or fallback to polling is planned.

## Testing Decisions

**What makes a good test:** tests should exercise observable behavior — what the user sees — not implementation details like hook internals or which fetch URL was called. Prefer testing the rendered graph node statuses before and after SSE events arrive, and the session state badge before and after user actions (pause/resume).

**Modules to test:**

- `useSessionStream` hook: unit-test the state machine in isolation. Seed a fake `EventSource` (a mock that emits events programmatically), assert that `graphData` nodes update correctly, that reconnection re-fetches a snapshot, and that teardown closes the `EventSource`.
- `SessionMonitor` component: integration-test the optimistic update path. Click Pause → assert badge shows "paused" before any network response. Click Resume → assert badge shows "running". Then deliver a correcting SSE event → assert the badge corrects.
- Graph patching: render a snapshot graph, deliver a `task_state_changed` event for a known node, assert that node's visual status class changes.

**Prior art in this codebase:** there are currently no frontend tests. The first tests should establish the pattern; `useSessionStream` is the right first seam because it has clear inputs (events) and outputs (state), making it straightforward to test without a full component mount.

## Out of Scope

- Server-side implementation of `GET /sessions/{id}/stream` beyond the contract specified above.
- Buffering SSE events for blueprints not currently visible in the blueprint stack.
- A `scope_iteration_started` event type (mentioned in ADR-0002 as a future event).
- Fallback to polling for browsers without `EventSource`.
- Real-time datastore updates via SSE.
- Any changes to the blueprint author view or agent runtime.

## Further Notes

- The ADR notes that the in-flight overwrite race condition (where poll responses clobber optimistic state) disappears when SSE is the single source of state truth. The optimistic update pattern described above is the mechanism by which this guarantee holds: user actions write state immediately; the stream patches, it does not drive.
- The `pollingKey` hack (bumping an integer to force the `useEffect` to re-run after resume) is a symptom of the polling model and disappears entirely with SSE.
- The existing COMPAS-unwrapping in `SessionMonitor` is not part of this work. SSE events carry plain typed payloads and do not use the COMPAS envelope format.
