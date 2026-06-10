---
title: "Blueprint stack depth filtering in useSessionStream"
type: AFK
---

## What to build

When the user has drilled into a composite task's inner blueprint, `task_state_changed` events for the outer (or any other) blueprint should be discarded — they must not patch the currently visible graph.

The hook already accepts a `visibleBlueprintId` parameter (wired in issue-sse-01). This slice ensures `SessionMonitor` keeps that value up to date as the user navigates the blueprint stack, so the hook always filters against the right blueprint.

- When the user enters a composite task: the `visibleBlueprintId` passed to the hook updates to the inner blueprint's ID.
- When the user navigates back: it reverts to the parent blueprint's ID.
- `task_state_changed` events whose `blueprint_id` does not match the current `visibleBlueprintId` are silently discarded (no buffering).

## Acceptance criteria

- [x] While viewing an inner blueprint, `task_state_changed` events for the outer blueprint do not update the displayed graph.
- [x] Navigating back to the outer blueprint resumes receiving its `task_state_changed` events correctly.
- [x] No events are buffered — events for non-visible blueprints are dropped.

## Blocked by

- issue-sse-01 (`useSessionStream` hook)
