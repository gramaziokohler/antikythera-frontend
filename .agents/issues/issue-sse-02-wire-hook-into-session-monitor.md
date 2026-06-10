---
title: "Wire useSessionStream into SessionMonitor, remove polling loop"
type: AFK
---

## What to build

Replace the polling `useEffect` in `SessionMonitor` with `useSessionStream`. The component stops owning the fetch loop entirely — `graphData` and `sessionState` come from the hook.

Changes:
- Remove the `setInterval` polling block and all state it drives (`pollingKey`, `pollInterval`).
- Call `useSessionStream` with `sessionId`, `apiBaseUrl`, and the currently visible blueprint ID.
- Consume `graphData` and `sessionState` from the hook's return value.
- Trigger a datastore fetch (`GET /sessions/{id}/data`) inside a `useEffect` that watches `sessionState` and fires when it transitions to `"completed"` or `"failed"` — not on every cycle.
- Remove the `pollingKey` increment from `handleResume` (it has no role once polling is gone).

The preview mode path (blueprintId without sessionId) is not affected — it continues to fetch the blueprint once on mount.

## Acceptance criteria

- [x] Opening a live session no longer produces repeated short-lived fetches in the Network tab — only one long-lived SSE connection is visible.
- [x] `graphData` and `sessionState` update when the hook delivers events.
- [x] Datastore is fetched exactly once when the session reaches `completed` or `failed`, not on every event.
- [x] `pollingKey` state and its `setPollingKey` call in `handleResume` are gone.
- [x] Preview mode (blueprint without session) is unaffected.

## Blocked by

- issue-sse-01 (`useSessionStream` hook)
