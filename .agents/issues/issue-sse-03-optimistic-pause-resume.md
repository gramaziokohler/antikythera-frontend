---
title: "Optimistic pause/resume updates"
type: AFK
---

## What to build

Make the session state badge respond instantly when the user clicks Pause or Resume, rather than waiting for the next state event from the stream.

- `handlePause`: set `sessionState` to `"paused"` immediately before the POST fires.
- `handleResume`: set `sessionState` to `"running"` immediately before the POST fires.
- The SSE stream confirms or corrects these updates; it does not drive them.

This eliminates the window where the badge reverts to the previous state between the click and the next stream event.

Integration tests verify:
- Clicking Pause → badge shows `"paused"` before any network response arrives.
- Clicking Resume → badge shows `"running"` before any network response arrives.
- A correcting `session_state_changed` SSE event afterwards updates the badge to the correct server state.

## Acceptance criteria

- [x] Clicking Pause updates the session state badge to `paused` immediately.
- [x] Clicking Resume updates the session state badge to `running` immediately.
- [x] A subsequent `session_state_changed` event from the stream updates the badge to the server's authoritative state.
- [x] Integration tests for both the optimistic and correction paths pass.

## Blocked by

- issue-sse-02 (hook wired into SessionMonitor)
