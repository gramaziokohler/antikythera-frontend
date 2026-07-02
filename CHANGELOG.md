# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `useSessionStream` hook owning the full SSE lifecycle: blueprint snapshot fetch, incremental `task_state_changed` / `session_state_changed` patching, auto-reconnect with back-off, and teardown on unmount.
- Datastore panel hydrates on connect/reconnect and updates incrementally via `datastore_updated` SSE events as tasks complete.

### Changed

- `SessionMonitor` replaced its 500ms polling loop with `useSessionStream`; only a single long-lived SSE connection is opened per session.
- Pause and resume apply optimistic state updates immediately; the stream confirms or corrects them.
- `task_state_changed` events are filtered by `visibleBlueprintId` so drilling into a composite task's inner blueprint does not apply outer events to the displayed graph.

### Removed

- Poll-interval settings panel (`showSettings`, `pollInterval`, `antikythera.pollInterval` localStorage key) removed entirely.
