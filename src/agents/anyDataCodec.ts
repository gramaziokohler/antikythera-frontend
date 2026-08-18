import { compas_pb } from '../proto/bundle';

const LIST_DATA_TYPE_URL = 'type.googleapis.com/compas_pb.data.ListData';
const DICT_DATA_TYPE_URL = 'type.googleapis.com/compas_pb.data.DictData';

/**
 * A plain object shaped like compas.data's own JSON envelope (`{dtype, data}`, see
 * compas.data.DataDecoder.object_hook) signals "reconstruct this as a COMPAS object" rather than
 * "this is a plain dict" — the same signal compas_pb's own decoder (`_decode_dict`) uses. Anything
 * else is a plain dict.
 */
function isCompasEnvelope(obj: Record<string, unknown>): boolean {
  return typeof obj.dtype === 'string' && 'data' in obj;
}

/**
 * Encodes an arbitrary JS value — as produced by a task-output editor (see TaskEditPanel.tsx) —
 * into the AnyData wire shape shared with the backend (compas_pb.data). Mirrors compas_pb's own
 * encoding rules (compas_pb.core._serializer_any) so a value round-trips identically whichever
 * side produced it:
 *  - primitives -> AnyData.value (google.protobuf.Value)
 *  - arrays -> ListData, packed under AnyData.message
 *  - plain objects -> DictData, packed under AnyData.message
 *  - a COMPAS envelope ({dtype, data, ...}) -> FallbackData wrapping a DictData, under
 *    AnyData.fallback — the one shape compas_pb's decoder treats as "reconstruct this class"
 *    (see compas_pb.core._deserialize_any / any_from_pb / _deserialize_fallback) rather than
 *    "this is just a dict". The stand-in agent never constructs the COMPAS object itself; this
 *    only shapes the bytes so Python can.
 */
export function encodeAnyData(value: unknown): compas_pb.data.IAnyData {
  if (value === null || value === undefined) {
    return { value: { nullValue: 0 } };
  }
  if (typeof value === 'string') {
    return { value: { stringValue: value } };
  }
  if (typeof value === 'number') {
    return { value: { numberValue: value } };
  }
  if (typeof value === 'boolean') {
    return { value: { boolValue: value } };
  }
  if (Array.isArray(value)) {
    const listData = compas_pb.data.ListData.create({ items: value.map(encodeAnyData) });
    return {
      message: {
        type_url: LIST_DATA_TYPE_URL,
        value: compas_pb.data.ListData.encode(listData).finish(),
      },
    };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const dictData = encodeDictData(obj);
    if (isCompasEnvelope(obj)) {
      return { fallback: { data: dictData } };
    }
    return {
      message: {
        type_url: DICT_DATA_TYPE_URL,
        value: compas_pb.data.DictData.encode(dictData).finish(),
      },
    };
  }
  // Unreachable for JSON-derived values (function, symbol, bigint); degrade rather than throw.
  return { value: { nullValue: 0 } };
}

function encodeDictData(obj: Record<string, unknown>): compas_pb.data.DictData {
  const items: { [k: string]: compas_pb.data.IAnyData } = {};
  for (const [key, val] of Object.entries(obj)) {
    items[key] = encodeAnyData(val);
  }
  return compas_pb.data.DictData.create({ items });
}

/** Decodes an AnyData value back into a plain JS value. Mirror image of encodeAnyData. */
export function decodeAnyData(anyData: compas_pb.data.IAnyData | null | undefined): unknown {
  if (!anyData) return null;

  if (anyData.value) {
    const v = anyData.value;
    if (v.stringValue !== undefined && v.stringValue !== null) return v.stringValue;
    if (v.numberValue !== undefined && v.numberValue !== null) return v.numberValue;
    if (v.boolValue !== undefined && v.boolValue !== null) return v.boolValue;
    return null;
  }

  // FallbackData carries a reconstructed-object envelope on the way in; the stand-in only ever
  // needs the plain dict underneath (it never constructs the COMPAS object itself).
  if (anyData.fallback) {
    return decodeDictData(anyData.fallback.data);
  }

  if (anyData.message) {
    const typeUrl = anyData.message.type_url;
    const bytes = anyData.message.value as Uint8Array;
    if (typeUrl === LIST_DATA_TYPE_URL) {
      const listData = compas_pb.data.ListData.decode(bytes);
      return (listData.items ?? []).map(decodeAnyData);
    }
    if (typeUrl === DICT_DATA_TYPE_URL) {
      const dictData = compas_pb.data.DictData.decode(bytes);
      return decodeDictData(dictData);
    }
  }

  return null;
}

function decodeDictData(dictData: compas_pb.data.IDictData | null | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(dictData?.items ?? {})) {
    result[key] = decodeAnyData(val);
  }
  return result;
}

const PASSTHROUGH_MARKER = Symbol('anyDataPassthrough');

/**
 * Wraps an already wire-ready AnyData so `AgentLauncher.completeTask` forwards it byte-for-byte
 * instead of re-deriving it from a decoded JS value.
 *
 * Why this exists: a task param carrying a COMPAS-typed simulated output isn't necessarily
 * `FallbackData`/`DictData` by the time the stand-in sees it. `BlueprintJsonSerializer.from_file`
 * parses the *uploaded blueprint file* itself with compas.data's own JSON decoder, which
 * reconstructs any `{dtype, data}`-shaped dict it finds — including inside a task param — before
 * the session ever starts. If compas_pb has a native protobuf mapping for that dtype (as it does
 * for common geometry types — see compas_pb/generated/geometry.proto), the assignment message
 * carries the param using that native message type, not FallbackData. `decodeAnyData` above has
 * no reason to know every such type, and per ADR-0003 the stand-in must not construct COMPAS
 * objects anyway — so for simulated outputs (see SimulationAgent) the safest and simplest move is
 * to never decode them at all: read the raw AnyData the param arrived as, and echo those same
 * bytes back as the output's AnyData, whatever shape they happen to be.
 */
export interface AnyDataPassthrough {
  [PASSTHROUGH_MARKER]: true;
  anyData: compas_pb.data.IAnyData;
}

export function passthroughAnyData(anyData: compas_pb.data.IAnyData): AnyDataPassthrough {
  return { [PASSTHROUGH_MARKER]: true, anyData };
}

export function isAnyDataPassthrough(value: unknown): value is AnyDataPassthrough {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[PASSTHROUGH_MARKER] === true;
}
