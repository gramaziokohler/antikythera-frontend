# ADR-0001: REST + JSON for the dashboard API; protobuf stays on the agent MQTT layer

**Status:** Accepted

## Context

The backend uses a COMPAS object envelope (`dtype` / `data` / `guid`) in its REST responses. The agent runtime already uses protobuf over MQTT for task assignment messages. The question arose whether to standardise on protobuf (via `compas_pb`) for REST API responses as well, to get shared type safety between frontend and backend.

## Decision

Keep the dashboard API as REST + JSON. Protobuf remains confined to the agent MQTT layer.

Introduce a single normalisation boundary in `api/client.ts` that unwraps the COMPAS envelope and returns clean, typed models to the rest of the frontend. All COMPAS-unwrapping logic lives there and nowhere else.

## Rationale

- **Debuggability.** REST + JSON is inspectable in browser devtools, curl, and manual API testing. Binary protobuf responses are opaque blobs — every Network tab inspection requires a decode step.
- **The problem is normalisation, not encoding.** The `dtype`/`data` unwrapping scattered across ~15 files is not caused by using JSON; it is caused by the absence of a single normalisation boundary. Switching to protobuf would not fix this — it would move the same problem into generated decode code.
- **Different transport, different audience.** MQTT messages are machine-to-machine on a message bus. REST API responses are consumed by a human-debugged frontend. The audiences justify different serialisation choices.

## Consequences

- `api/client.ts` is the only file that imports or references COMPAS envelope types (`dtype`, `data`, `guid`).
- All other modules receive plain typed models (`Blueprint`, `Session`, `Task`, etc.) with no envelope fields.
- Adding a new REST endpoint means adding a normaliser in `api/client.ts`, not scattering unwrapping into the component that calls it.
- Protobuf codegen (`src/proto/`) remains in use exclusively for the agent MQTT layer.
