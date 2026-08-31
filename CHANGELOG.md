# Changelog

## [0.5.0](https://github.com/gramaziokohler/antikythera-frontend/compare/antikythera-frontend-v0.4.0...antikythera-frontend-v0.5.0) (2026-08-31)


### ⚠ BREAKING CHANGES

* the frontend no longer generates protobuf code, and protobufjs is gone. Imports of ../agents/{Agent,AgentLauncher,Task, ExecutionContext} and ../services/MqttService move to @gramaziokohler/antikythera-ts/agents.

### Features

* add useSessionStream hook with vitest setup (issue-sse-01) ([23009a2](https://github.com/gramaziokohler/antikythera-frontend/commit/23009a2df1407527daa70c1486085fb68bff95df))
* consume the Antikythera and compas_pb TypeScript SDKs ([090f2ae](https://github.com/gramaziokohler/antikythera-frontend/commit/090f2aee0b203ec3e7204a98bdf8826212956049))
* optimistic pause/resume updates in SessionMonitor (issue-sse-03) ([237040c](https://github.com/gramaziokohler/antikythera-frontend/commit/237040cf487e9e652b582b6f37fb6372d426c159))
* wire useSessionStream into SessionMonitor, remove polling loop (issue-sse-02) ([c62fd45](https://github.com/gramaziokohler/antikythera-frontend/commit/c62fd45ef113b754c2263b9f0b207bc0fc40f4f1))

## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `NotificationStore` singleton backing the notification overlay, so any component can raise a notification without being wired through `NotificationManager`.
- `useSessionStream` hook owning the full SSE lifecycle: blueprint snapshot fetch, incremental `task_state_changed` / `session_state_changed` patching, auto-reconnect with back-off, and teardown on unmount.
- Datastore panel hydrates on connect/reconnect and updates incrementally via `datastore_updated` SSE events as tasks complete.

### Changed

- Blueprint uploads rejected by the API report each reason in the notification overlay, alongside session failures, instead of a bare "Upload failed" status line.
- Notification messages longer than 140 characters are collapsed to a word-boundary preview with a "show more.." toggle; expanded messages scroll instead of growing the toast without limit.
- Session failures are reported through the notification overlay instead of the inline error line, titled with the error code (e.g. "Session failed: SCOPE_CONDITION_ERROR"). The banner previously rendered `[object Object]`, since the error is COMPAS-serialized and its fields live under `data`.
- **Breaking:** Browser agents now read and write the `compas_pb` v1 wire format, including its versioned root envelope, explicit integer/float fields, and native nested list/dictionary fields.
- Protobuf generation now downloads the official `compas-dev/compas_pb` definitions pinned to v1.1.4 instead of following the legacy repository's `main` branch.
- `SessionMonitor` replaced its 500ms polling loop with `useSessionStream`; only a single long-lived SSE connection is opened per session.
- Pause and resume apply optimistic state updates immediately; the stream confirms or corrects them.
- `task_state_changed` events are filtered by `visibleBlueprintId` so drilling into a composite task's inner blueprint does not apply outer events to the displayed graph.

### Removed

- Poll-interval settings panel (`showSettings`, `pollInterval`, `antikythera.pollInterval` localStorage key) removed entirely.
