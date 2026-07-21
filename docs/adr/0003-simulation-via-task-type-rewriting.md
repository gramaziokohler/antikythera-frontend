# ADR-0003: Simulation mode rewrites task types into a derived blueprint

**Status:** Accepted

## Context

Authoring a blueprint today is cumbersome because a blueprint cannot be *run* until every agent it depends on exists and is listening on the wire. Nothing gets triggered otherwise. Authors want to execute a blueprint end-to-end — exercising real scheduling, dependency resolution, conditions, scopes and datastore flow — before writing a single agent.

The design constraint, set by the author of the feature: use the existing mechanisms wherever possible, so that a simulated run reflects the eventual real run as closely as possible, and so that the change stays small enough to manage.

The central problem is **claim scoping**. Agents claim tasks by type: `AgentLauncher` matches an incoming `TaskAssignmentMessage` against registered agents by the `{agent_type}.` prefix. An agent that stands in for unimplemented agents therefore has to claim tasks nobody implements — but claiming is anonymous and first-come-first-served, with no priority and no session identity in the protocol. A stand-in that claims indiscriminately would hijack tasks belonging to real sessions, and the dashboard is already an agent host (`App.tsx` renders `UserPromptDialog` and `NotificationManager`, each of which instantiates the launcher), so every open dashboard tab would do it.

## Decision

**Simulation mode rewrites task types.** Pressing *Simulate* in the authoring tool produces a derived blueprint in which every non-system task's type is prefixed with `simulation.`:

```
compas_fab.plan_trajectory  →  simulation.compas_fab.plan_trajectory
```

The derived blueprint is stored under a derived id (`{id}__sim`) and started as an ordinary session. Pressing *Save* / *Upload* stores the blueprint unmodified; only *Simulate* rewrites.

**System task types are never rewritten.** `system.start`, `system.end`, `system.composite` and `system.sleep` keep their types and are executed by the real `SystemAgent`.

**Simulated outputs travel as task params** on the derived blueprint, so the stand-in agent receives them inside the `TaskAssignmentMessage` that assigns the task.

**Tasks may opt out** via a per-task toggle in the authoring tool, keeping their real type so a real agent claims them. This yields hybrid simulations.

**A task's declared output `type` is authoritative** for the shape of its simulated output. Simulation renders an editor from it; the author supplies only the value. The type is not re-declared at simulation time, so there is no second source of truth that can drift from the blueprint.

**`type` stays free-form; the editor degrades.** Three tiers:

1. **Native form** — `str`, `int`, `float`, `bool`, `timestamp` render as text / number / checkbox / date inputs. This covers 49 of the 56 type declarations across the current example blueprints.
2. **`list[T]`** — repeats the tier-1 or tier-3 editor for `T`.
3. **Raw COMPAS JSON** — any dotted class path, and `dict`, get a JSON textarea.

**The stand-in agent never constructs a COMPAS object.** For tier 3 it passes the `{dtype, data}` JSON through as `FallbackData` / `DictData`, and Python reconstitutes the object on arrival.

**A `simulation.*` task with no authored output halts at a breakpoint** rather than completing empty.

**Only the tab that started the simulation registers a stand-in agent.** Other tabs viewing the same session render the graph and register nothing. Breakpoints remain browser-local to the driving tab.

## Rationale

- **The prefix is a reversible transform, not a fork.** `Agent._get_tool_for_task` splits on the first dot only (`task.type.split(".", 1)[1]`), so `simulation.compas_fab.plan_trajectory` resolves to agent type `simulation`, tool `compas_fab.plan_trajectory`. The original type survives intact inside the tool name, so the derived blueprint can be mechanically converted back. Going live is a button, not a hand edit.
- **Claim scoping falls out for free.** A stand-in registered as agent type `simulation` claims `simulation.*` and nothing else, using the existing dispatch path unchanged. No wildcard claiming, no protocol change, no race against real agents, and no hijacking of real sessions — because `simulation.*` types only ever exist in derived blueprints.
- **System types are structurally load-bearing, not merely agent selectors.** `Task.is_composite`, `is_start` and `is_end` are literal comparisons against `system.composite` / `system.start` / `system.end`. Rewriting start or end breaks `_build_graph`, which looks them up to inject the FF/SS edges that bind an inner blueprint to its composite task. Rewriting composite is quieter and worse: `_preprocess_blueprint` skips the task and inner blueprints silently never load.
- **Params reach the agent without any new channel.** `_schedule_tasks` already passes `params=params_to_dict(task.params)` into every assignment message, and params already carry arbitrary COMPAS objects (the orchestrator injects a whole `compas_model.Model` as a param). Simulated outputs therefore need no storage of their own, no fetch, and no correlation step — and they survive a page reload, a session restart, and being opened on another machine, all of which matter because breakpoints make simulated sessions long-lived.

## Consequences

- **A simulated blueprint is a separate stored artifact.** `upload_blueprint` derives the id from the JSON body and `add_blueprint` writes `blueprint:{id}` with no existence check, so uploading a rewrite under the original id would silently destroy the production blueprint. Derived ids are mandatory, not cosmetic. Simulation blueprints appear in `GET /blueprints` alongside real ones; a metadata flag to hide them is deferred until the clutter is felt.
- **The rewrite must be idempotent.** Re-opening a derived blueprint and pressing Simulate again must not produce `simulation.simulation.foo`.
- **v1 does not support composite tasks.** A composite keeps its type and therefore keeps its `blueprint` param pointing at a stored inner blueprint, which `_load_inner_blueprint` fetches unmodified — so the inner tasks keep real types, nothing claims them, and `RedispatchPoller` fails the session with `NO_AGENT_CLAIMED`. Supporting composites requires rewriting and re-uploading the entire transitive closure of inner blueprints under fresh ids and patching every composite's pointer, recursively. That is a separate feature with its own failure modes (partial upload, no rollback) and is deliberately out of scope for v1.
- **Simulation cannot defer authoring inner blueprints, only leaf agents.** Even once composites are supported, a dynamic composite still needs a real registered sequencer and a real uploaded `compas_model`, because `_expand_dynamic_tasks` and `BasicSequencer` run in the backend against real data.
- Simulated outputs stored as params are the *authored defaults*. An edit made while a task is held at a breakpoint overrides them at completion time and is consumed immediately, so it requires no persistence.
- **Treating `outputs[].type` as authoritative promotes it from documentation to contract, and existing blueprints will not survive the promotion cleanly.** Nothing in the orchestrator reads it today: `outputs_to_keys` discards it before dispatch (`TaskAssignmentMessage.output_keys` is `list[str]`), and `_enrich_data_with_types` infers a type from the runtime value instead. Declarations are consequently already inaccurate — `system.start` declares `timestamp` while `SystemAgent.start_process` returns `time.time()`, a float. The first author to simulate an existing blueprint will surface a backlog of these. This is intended, but it should not come as a surprise.
- A closed enum for `type` was rejected: it would invalidate existing blueprints and would need extending every time an agent returns a new type, in a system whose extension story is that anyone may write an agent in any language. Graceful degradation to a JSON textarea costs nothing and never blocks an author.
- The unimplemented `antikythera-agents describe` / `tools.json` catalogue specified in `ARCHITECTURE.md` is the natural eventual source for which types a given task type can produce. Simulation mode is the first feature with a concrete reason to build it; it remains out of scope for v1.
- The stand-in agent must claim immediately and only then block, because `RedispatchPoller` fails a task left in `READY` after `MAX_REDISPATCHES`, and `pause()` does not stop the poller.
- Failure behaviour is deliberately not softened for simulation; see backend ADR-0001.
- **Two tabs driving the same simulation is unsupported, and is made visible rather than prevented.** The dashboard indicates whether the current tab is driving a simulation or merely watching it. Nothing enforces exclusivity, because nothing in the protocol can: claiming is anonymous and first-come-first-served, with no leader election.

  Adding a session id to the protocol does **not** solve this. A session id distinguishes sessions, not clients — two tabs on the same session filter identically and both still claim. It would only help the unrelated case of two people simulating *different* blueprints on a shared broker.

  Note that data is unaffected either way: because simulated outputs travel in the assignment message, the stand-in is stateless with respect to data, and any stand-in completes any simulated task correctly. What a competing stand-in corrupts is *control* — breakpoints are browser-local, so a foreign stand-in that claims a breakpointed task completes it immediately and the breakpoint is silently skipped.

  Baking breakpoints into params was considered as the alternative, since it would make the stand-in fully stateless and render concurrency harmless. It was rejected because it fixes breakpoints at Simulate time, and toggling a breakpoint mid-session on a not-yet-run task is what makes the feature usable as a debugger.

- **The underlying problem is that opening the dashboard makes you an agent, and that should change.** `App.tsx` instantiates `AgentLauncher` unconditionally via `UserPromptDialog` and `NotificationManager`. This already misbehaves independently of simulation: with two dashboards open, a `user_prompt.confirm` task pops in whichever tab claims first, effectively at random. Restricting the simulation stand-in to the driving tab is a local workaround for a general design issue; agent registration should eventually become an explicit act rather than a side effect of rendering the dashboard.
