import type {
  Blueprint,
  Task,
  Dependency,
  TaskInput,
  TaskOutput,
  TaskParam,
} from '../types/blueprint-schema';

/**
 * Loading a stored blueprint back into the authoring tool, the inverse of blueprint-save.ts.
 *
 * The orchestrator serves blueprints through COMPAS `json_dumps`, which wraps every Data object
 * as `{dtype, guid, data}` — so a stored blueprint comes back nested, while the authoring tool
 * (and the `.json` files Export writes and Open reads) works in the flat shape of
 * blueprint-schema.ts. Normalising here keeps that wire detail out of AuthorApp, which should
 * only ever see a `Blueprint`.
 *
 * A blueprint written by Export and re-uploaded verbatim is already flat, so every unwrap below
 * tolerates both shapes rather than assuming the COMPAS one.
 */

interface CompasWrapped {
  dtype?: string;
  guid?: string;
  data?: unknown;
}

/** The payload of a COMPAS-wrapped object, or the object itself when it is already flat. */
function unwrap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const wrapper = value as CompasWrapped;
  const inner = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : value;
  return inner as Record<string, unknown>;
}

function unwrapAll(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(unwrap) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Drops the keys COMPAS fills in with `null` for an absent value. The authoring tool's editors
 * treat "absent" and "null" differently — a `null` type would render as a declared type named
 * "null" — and Export should not start writing key: null for every field left blank.
 */
function withoutNulls<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as T;
}

/**
 * Reads the declared type off a stored IO item.
 *
 * `type_hint` is the field the model actually carries; `type` is a deprecated
 * alias kept for blueprints written before the rename (the backend still accepts
 * it on upload). Reading only one of the two loses the declared type of every
 * task that used the other, so both are accepted here and only `type_hint` is
 * produced from this point on.
 */
function toTypeHint(raw: Record<string, unknown>): unknown {
  return raw.type_hint ?? raw.type;
}

function toTaskField(raw: Record<string, unknown>) {
  return withoutNulls({
    name: String(raw.name ?? ''),
    type_hint: toTypeHint(raw),
    value: raw.value,
    description: raw.description,
  });
}

function toInput(raw: Record<string, unknown>): TaskInput {
  return withoutNulls({ ...toTaskField(raw), get_from: raw.get_from }) as TaskInput;
}

function toOutput(raw: Record<string, unknown>): TaskOutput {
  return withoutNulls({ ...toTaskField(raw), set_to: raw.set_to }) as TaskOutput;
}

function toParam(raw: Record<string, unknown>): TaskParam {
  return toTaskField(raw) as TaskParam;
}

function toDependency(raw: Record<string, unknown>): Dependency {
  return withoutNulls({ id: String(raw.id ?? ''), type: raw.type }) as Dependency;
}

function toTask(raw: Record<string, unknown>): Task {
  const task: Task = { id: String(raw.id ?? ''), type: String(raw.type ?? '') };

  const description = asString(raw.description);
  const condition = asString(raw.condition);
  if (description) task.description = description;
  if (condition) task.condition = condition;

  const inputs = unwrapAll(raw.inputs).map(toInput);
  const outputs = unwrapAll(raw.outputs).map(toOutput);
  const params = unwrapAll(raw.params).map(toParam);
  const dependsOn = unwrapAll(raw.depends_on).map(toDependency);

  // Kept off the object entirely when empty, so a blueprint that round-trips through the
  // authoring tool serialises the same way it arrived (see flowToBlueprint).
  if (inputs.length) task.inputs = inputs;
  if (outputs.length) task.outputs = outputs;
  if (params.length) task.params = params;
  if (dependsOn.length) task.depends_on = dependsOn;

  return task;
}

/** Normalises a stored blueprint — COMPAS-wrapped or already flat — into an authoring `Blueprint`. */
export function normalizeBlueprint(raw: unknown): Blueprint & { tasks: Task[] } {
  const data = unwrap(raw);
  const id = asString(data.id);
  if (!id) {
    throw new Error('Blueprint is missing an id');
  }

  const blueprint: Blueprint & { tasks: Task[] } = {
    version: asString(data.version) ?? '1.0',
    id,
    name: asString(data.name) ?? id,
    tasks: unwrapAll(data.tasks).map(toTask),
  };

  const description = asString(data.description);
  if (description) blueprint.description = description;

  return blueprint;
}

/** Fetches a stored blueprint by id, ready to open in the authoring tool. */
export async function fetchBlueprint(apiBaseUrl: string, id: string): Promise<Blueprint & { tasks: Task[] }> {
  const response = await fetch(`${apiBaseUrl}/blueprints/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `Blueprint "${id}" not found`
        : `Failed to load blueprint "${id}" (${response.status})`,
    );
  }
  return normalizeBlueprint(await response.json());
}
