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
The lifecycle of a session: `pending` → `running` ↔ `paused` → `completed` | `failed`.

**Scope**:
A named group of tasks within a blueprint that share an execution policy: `retry`, `while`, or `skip`. Scopes are visualised as group nodes in the graph.
_Avoid_: group, policy group

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

### Data formats

**COMPAS envelope**:
The backend's object serialisation wrapper: `{ dtype: string, data: {...}, guid: string }`. All REST API responses from the backend are COMPAS-wrapped. The frontend unwraps them exclusively at the `api/client` boundary.
_Avoid_: COMPAS wrapper, dtype wrapper

**COMPAS geometry**:
Geometry data serialised in the COMPAS format (meshes, point clouds, frames, etc.). Rendered in the datastore via the geometry viewer.
