---
title: "Remove poll interval settings panel"
type: AFK
---

## What to build

Delete all traces of the configurable poll interval now that polling is gone.

- Remove `showSettings` and `pollInterval` state.
- Remove the `antikythera.pollInterval` `localStorage` read on mount and the write on interval change.
- Remove the `Settings` icon button and the settings panel JSX (the dropdown with interval buttons).
- Remove the `Settings` import from `lucide-react` if it is no longer used elsewhere in the file.

No new UI is added. The header control area simply no longer has a settings gear.

## Acceptance criteria

- [x] The settings gear button is gone from the session monitor header.
- [x] `showSettings`, `pollInterval`, and the `antikythera.pollInterval` localStorage key are absent from the codebase.
- [x] No TypeScript or lint errors introduced.

## Blocked by

- issue-sse-02 (polling loop removed — settings panel only makes sense alongside polling)
