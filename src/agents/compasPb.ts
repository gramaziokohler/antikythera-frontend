import { compas_pb, google } from '../proto/bundle';

/**
 * The frontend implements the compas_pb v1 wire format. Minor v1 releases are
 * wire-compatible, so a stable v1 version marker is sufficient for messages it writes.
 */
export const COMPAS_PB_WIRE_VERSION = '1.0.0';

export function unwrapMessage(message: Uint8Array): google.protobuf.IAny | null {
    const envelope = compas_pb.data.MessageData.decode(message);
    const version = envelope.version || '';

    if (version.split('.', 1)[0] !== '1') {
        throw new Error(`Unsupported compas_pb wire version: ${version || '<missing>'}`);
    }

    return envelope.data?.message || null;
}

export function wrapMessage(message: Uint8Array, typeUrl: string): Uint8Array {
    const anyMessage = google.protobuf.Any.create({
        type_url: typeUrl,
        value: message
    });
    const data = compas_pb.data.AnyData.create({ message: anyMessage });
    const envelope = compas_pb.data.MessageData.create({
        data,
        version: COMPAS_PB_WIRE_VERSION
    });

    return compas_pb.data.MessageData.encode(envelope).finish();
}

/**
 * A plain object shaped like compas.data's own JSON envelope (`{dtype, data}`, see
 * compas.data.DataDecoder.object_hook) signals "reconstruct this as a COMPAS object" rather than
 * "this is a plain dict". Anything else is a plain dict.
 */
function isCompasEnvelope(obj: Record<string, unknown>): boolean {
    return typeof obj.dtype === 'string' && 'data' in obj;
}

/**
 * Encodes an arbitrary JS value into the compas_pb v1 AnyData wire shape, mirroring
 * `compas_pb.core._serializer_any`: explicit int/float arms, native list/dict containers, and
 * the "base64:" string convention for bytes.
 *
 * The one arm that has no direct Python counterpart is the COMPAS envelope. Python reaches
 * `_serialize_fallback` from a live `compas.data.Data` *instance*; the frontend never holds one,
 * only the `{dtype, data}` JSON an output editor authored (see TaskEditPanel.tsx). Shape matters
 * here: `_deserialize_dict` hands back a plain dict, while `_deserialize_fallback` is the only
 * arm that runs `DataDecoder` and reconstructs the object. So an envelope has to go out as
 * FallbackData, or it arrives backend-side as a bare dict.
 */
export function encodeAnyData(value: unknown): compas_pb.data.IAnyData {
    if (value === null || value === undefined) {
        return { value: { nullValue: 0 } };
    }
    if (typeof value === 'string') {
        return { value: { stringValue: value } };
    }
    if (typeof value === 'boolean') {
        return { value: { boolValue: value } };
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
    }
    if (value instanceof Uint8Array) {
        const binary = Array.from(value, byte => String.fromCharCode(byte)).join('');
        return { value: { stringValue: `base64:${btoa(binary)}` } };
    }
    if (Array.isArray(value)) {
        return { listValue: { items: value.map(encodeAnyData) } };
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const items = encodeMap(obj);
        return isCompasEnvelope(obj) ? { fallback: { data: { items } } } : { dictValue: { items } };
    }

    throw new TypeError(`Unsupported value for compas_pb serialization: ${typeof value}`);
}

export function decodeAnyData(data: compas_pb.data.IAnyData | null | undefined): unknown {
    if (!data) return null;

    if (data.intValue !== undefined && data.intValue !== null) {
        return typeof data.intValue === 'number' ? data.intValue : data.intValue.toNumber();
    }
    if (data.doubleValue !== undefined && data.doubleValue !== null) {
        return data.doubleValue;
    }
    if (data.dictValue) {
        return decodeMap(data.dictValue.items ?? {});
    }
    if (data.listValue) {
        return (data.listValue.items ?? []).map(decodeAnyData);
    }
    if (data.value) {
        const value = data.value;
        if (value.nullValue !== undefined && value.nullValue !== null) return null;
        if (value.stringValue !== undefined && value.stringValue !== null) {
            if (value.stringValue.startsWith('base64:')) {
                const binary = atob(value.stringValue.slice(7));
                return Uint8Array.from(binary, character => character.charCodeAt(0));
            }
            return value.stringValue;
        }
        if (value.numberValue !== undefined && value.numberValue !== null) return value.numberValue;
        if (value.boolValue !== undefined && value.boolValue !== null) return value.boolValue;
    }
    // FallbackData carries a reconstructed-object envelope on the way in; a browser agent only
    // ever needs the plain dict underneath (it never constructs the COMPAS object itself).
    if (data.fallback) {
        return decodeMap(data.fallback.data?.items ?? {});
    }
    // Legacy (pre-v1) containers, which packed themselves under google.protobuf.Any instead of
    // using the native list/dict arms. compas_pb still reads these, so this side does too.
    if (data.message) {
        const typeName = data.message.type_url?.split('/').pop();
        const bytes = data.message.value as Uint8Array;
        if (typeName === 'compas_pb.data.ListData') {
            return compas_pb.data.ListData.decode(bytes).items.map(decodeAnyData);
        }
        if (typeName === 'compas_pb.data.DictData') {
            return decodeMap(compas_pb.data.DictData.decode(bytes).items);
        }
    }

    return null;
}

function encodeMap(obj: Record<string, unknown>): { [key: string]: compas_pb.data.IAnyData } {
    const items: { [key: string]: compas_pb.data.IAnyData } = {};
    for (const [key, item] of Object.entries(obj)) {
        items[key] = encodeAnyData(item);
    }
    return items;
}

export function decodeMap(map: { [key: string]: compas_pb.data.IAnyData }): { [key: string]: unknown } {
    const result: { [key: string]: unknown } = {};
    for (const [key, value] of Object.entries(map)) {
        result[key] = decodeAnyData(value);
    }
    return result;
}

const PASSTHROUGH_MARKER = Symbol('anyDataPassthrough');

/**
 * Wraps an already wire-ready AnyData so `AgentLauncher.completeTask` forwards it byte-for-byte
 * instead of re-deriving it from a decoded JS value.
 *
 * Why this exists: a task param carrying a COMPAS-typed simulated output isn't necessarily
 * FallbackData/DictData/a primitive by the time the stand-in sees it.
 * `BlueprintJsonSerializer.from_file` parses the *uploaded blueprint file* itself with
 * compas.data's own JSON decoder, which reconstructs any `{dtype, data}`-shaped dict it finds —
 * including inside a task param — before the session ever starts. If compas_pb has a native
 * protobuf mapping for that dtype (as it does for common geometry types — see
 * compas_pb/generated/geometry.proto), the assignment message carries the param using that
 * native message type, not FallbackData. `decodeAnyData` above has no reason to know every such
 * type, and per ADR-0003 the stand-in must not construct COMPAS objects anyway — so for
 * simulated outputs (see SimulationAgent) the safest and simplest move is to never decode them
 * at all: read the raw AnyData the param arrived as, and echo those same bytes back as the
 * output's AnyData, whatever shape they happen to be.
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
