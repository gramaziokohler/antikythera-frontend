# Antikythera Frontend

A browser-based dashboard for authoring, launching, and monitoring distributed workflow executions. Workflows are defined as directed acyclic graphs of tasks, executed by agents communicating over MQTT.

## Language

### Workflow model

**Blueprint**:
A workflow definition: a directed acyclic graph of tasks with their dependencies, parameters, and scope policies. Immutable once uploaded.
_Avoid_: workflow, pipeline, graph definition

**Session**:
A single running (or completed) execution of a blueprint. Has its own lifecycle state and its own datastore.
_Avoid_: run, execution, instance

**Task**:
A unit of work within a blueprint. Has a type (which determines which agent executes it), inputs, outputs, parameters, and a lifecycle state.
_Avoid_: node (use node only when referring to the visual graph element), step, job

**Task state**:
The lifecycle of a single task within a session: `pending` → `running` → `succeeded` | `failed` | `skipped`.

**Session state**:
The lifecycle of a session. The backend recognises exactly five: `pending` → `running` ↔ `stopped` → `completed` | `failed`. There is no backend `paused` state — pausing, stopping, and resetting a terminal session all land in `stopped`.

**Paused**:
A frontend-only optimistic state, set locally the instant the user clicks Pause so the badge responds without waiting for the stream. The backend never emits it; the next `session_state_changed` event corrects the badge to `stopped`.
_Avoid_: treating `paused` as a value the API can return.

**Preview**:
A frontend-only session state for a blueprint being displayed in the session monitor before any session exists for it. Together with `pending` and `paused` it forms the set of states in which the blueprint may still be modified.
_Avoid_: draft, staging

**Scope**:
A named group of tasks within a blueprint that share an execution policy: `retry`, `while`, or `skip`. Scopes are visualised as group nodes in the graph.
_Avoid_: group, policy group
_Note_: `retry` is a misnomer — it repeats a scope a fixed number of times after it succeeds, and is never triggered by failure. See backend ADR-0001.

**Datastore**:
The key-value store of task outputs for a session. Tasks read inputs from and write outputs to the datastore. Scoped per blueprint (main blueprint and inner blueprints have separate namespaces).
_Avoid_: data store (two words), output store, session data

**Composite task**:
A task whose implementation is itself a blueprint. Navigating into a composite task shows its inner blueprint as a nested graph.
_Avoid_: nested task, sub-task

**Blueprint stack**:
The navigation history of blueprint drill-downs within a session monitor. Pushing onto the stack means entering a composite task's inner blueprint; popping returns to the parent.

### Agent model

**Agent**:
A process (browser tab or external process) that claims and executes tasks of specific types. Communicates with the backend exclusively over MQTT.
_Avoid_: worker, executor

**Task type**:
A string identifier (e.g. `user_prompt.confirm`) that determines which agent implementation handles a task.

**Stand-in agent**:
An agent that claims tasks it has no implementation for and completes them with their simulated outputs. It stands in for agents that do not exist yet.
_Avoid_: mock agent, fake agent, dummy agent

### Simulation

**Simulation mode**:
Running a blueprint against stand-in agents rather than real ones, so that an author can execute a blueprint before implementing the agents it depends on. The orchestrator does not distinguish a simulated session from any other session.
_Avoid_: dry run, debug mode, test mode

**Simulated output**:
A value an author declares a task will produce, supplied to the stand-in agent so it can complete the task. Its shape is determined by the task's declared output `type` in the blueprint, which simulation mode treats as authoritative.
_Avoid_: mock data, fake output, canned value, stub value

**Simulation profile**:
The complete set of simulated outputs for a blueprint, together with each task's success/failure disposition. Authored before a simulated session starts and editable at a breakpoint.
_Avoid_: sim config, mock spec, fixture

**Breakpoint**:
A mark on a task instructing the stand-in agent to hold it rather than complete it, so the author can inspect and edit before letting execution continue. Holding at a breakpoint is **not** pausing: the orchestrator still considers the task `running`, and the stand-in agent — not the orchestrator — is what is waiting. Stepping is the case where every task carries a breakpoint.
_Avoid_: pause point, halt, stop point

**Simulation delay**:
A single artificial per-task delay applied by the stand-in agent for the whole session, so a simulation with no breakpoints progresses slowly enough to watch. Distinct from a task's real duration, which no simulation attempts to predict.
_Avoid_: simulated duration, task duration

### Data formats

**COMPAS envelope**:
The backend's object serialisation wrapper: `{ dtype: string, data: {...}, guid: string }`. All REST API responses from the backend are COMPAS-wrapped. The frontend unwraps them exclusively at the `api/client` boundary.
_Avoid_: COMPAS wrapper, dtype wrapper

**COMPAS geometry**:
Geometry data serialised in the COMPAS format (meshes, point clouds, frames, etc.). Rendered in the datastore via the geometry viewer.

## Running the full stack locally (from source)

Needed for anything that can't be exercised in unit tests alone — in particular simulation
mode, which only exists over a real claim/allocate/complete round trip against a live broker
and orchestrator. `antikythera-backend/docker-compose.yml` builds both images from the working
tree and wires everything together; no env overrides are needed for a host browser.

**Build the images from source** (run from `antikythera-backend/`):

```sh
docker compose build
```

This builds `antikythera:dev` from the backend context (orchestrator, system agents, MCP
server all share this image, just with different `command:`s) and
`antikythera-frontend:dev` from `../antikythera-frontend` (this repo — both entry points,
`index.html` and `author.html`, are included by default).

**Bring the stack up / down**:

```sh
docker compose up -d      # start Redis, the MQTT broker, orchestrator, system agents,
                           # MCP server, and the nginx-served frontend
docker compose down       # stop everything; add -v to also drop the Redis volume
```

**Where things are reachable** (host browser, no proxy needed except where noted):

- Dashboard: `http://localhost/`
- Authoring tool: `http://localhost/author.html`
- Orchestrator REST API directly: `http://localhost:8000` (the frontend also reaches it via
  nginx at `/api/*`, proxied to `orchestrator:8000`)
- MQTT broker, browser-facing (WebSocket): `ws://localhost:8083/mqtt` — the browser connects
  here directly, not through nginx (see `MqttService.ts`'s `defaultBrokerUrl`)
- MQTT broker, service-facing (TCP): `localhost:1883`
- MCP server (SSE): `http://localhost:8001/sse`

**Tail logs**:

```sh
docker compose logs -f orchestrator   # session/blueprint lifecycle, scheduling
docker compose logs -f agents         # system.* task execution (akt-agents-sys)
docker compose logs -f mqtt-broker    # claim/allocate/completion traffic
```

**Rebuild a single service after a code change** (faster than a full `build`+`up` cycle):

```sh
docker compose build frontend && docker compose up -d --no-deps frontend
docker compose build orchestrator && docker compose up -d --no-deps orchestrator agents
```

**Reset persisted state between runs**: session and blueprint data lives in the `redis-data`
volume; blow it away with the stack down to start from a clean slate:

```sh
docker compose down -v
```

**Driving a simulation manually**: open the authoring tool, build a small blueprint with a
non-system task (leave its output value unset to see the stand-in hold, or fill one in to see
it complete), press *Simulate*, and watch the dashboard tab that navigated there — it is the
one that registered the stand-in (see `useSimulationStandIn`) and will claim and complete (or
hold) the `simulation.*` task. Opening the same session URL in a second tab renders the graph
without claiming anything.
