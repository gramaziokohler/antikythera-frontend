---
title: "useSessionStream hook — core lifecycle"
type: AFK
---

## What to build

Create a `useSessionStream` hook that owns the full SSE lifecycle for a session monitor. The hook accepts `sessionId`, `apiBaseUrl`, and a `visibleBlueprintId`, and returns `{ graphData, sessionState, reconnect }`.

Lifecycle:
1. Fetch full blueprint snapshot via `GET /sessions/{id}/blueprint` → call `transformBlueprintToGraph` → set initial `graphData` and `sessionState`.
2. Open `EventSource` on `GET /sessions/{id}/stream`.
3. On `task_state_changed { blueprint_id, task_id, state }`: patch the matching node's `status` in `graphData` if `blueprint_id` matches `visibleBlueprintId`; discard otherwise.
4. On `session_state_changed { state }`: update `sessionState`.
5. On `EventSource` error: close, wait a brief back-off (e.g. 2s), re-fetch snapshot, re-open stream.
6. On unmount or `sessionId` change: close `EventSource`.

The hook does not fetch the datastore — that is triggered by the consumer when `sessionState` transitions to `"completed"` or `"failed"`.

Unit tests use a fake `EventSource` that emits events programmatically. Tests assert:
- Initial `graphData` is built from the snapshot.
- A `task_state_changed` event patches the correct node's `status`.
- A `session_state_changed` event updates `sessionState`.
- An error triggers reconnect: snapshot is re-fetched and a new `EventSource` is opened.
- Unmount closes the `EventSource`.

## Acceptance criteria

- [x] `useSessionStream` hook exists and is importable.
- [x] Opening the hook fetches the blueprint snapshot once and builds `graphData`.
- [x] `task_state_changed` events update the affected node's `status` in `graphData`.
- [x] `session_state_changed` events update `sessionState`.
- [x] An `EventSource` error triggers a reconnect: snapshot re-fetched, stream re-opened.
- [x] Unmounting the consumer closes the `EventSource`.
- [x] Unit tests pass covering all of the above behaviours.

## Blocked by

None — can start immediately.
