import { describe, expect, it } from 'vitest';
import { antikythera, compas_pb } from '../../proto/bundle';
import {
    COMPAS_PB_WIRE_VERSION,
    decodeAnyData,
    encodeAnyData,
    unwrapMessage,
    wrapMessage
} from '../compasPb';
import { Task } from '../Task';

// Produced by compas_pb 1.1.4 in Python from an Antikythera TaskAssignmentMessage.
const PYTHON_V1_TASK = 'CrUBCrIBCjh0eXBlLmdvb2dsZWFwaXMuY29tL2FudGlreXRoZXJhLnYxLlRhc2tBc3NpZ25tZW50TWVzc2FnZRJ2CgtweXRob24td2lyZRILc3lzdGVtLnRlc3QaKQoGbmVzdGVkEh86HQoEEgIgAQoVMhMKEQoEdGV4dBIJEgcaBWhlbGxvGhIKBWZsb2F0EgkpAAAAAAAADEAaDQoHaW50ZWdlchICIAMyDAjjifzTBhCg7rn6ARIFMS4xLjQ=';

// Map entries are typed as the plain interface, which has no oneof accessor.
const oneofOf = (data?: compas_pb.data.IAnyData) => compas_pb.data.AnyData.create(data).data;

describe('compas_pb v1 wire codec', () => {
    it('preserves v1 primitive and container types', () => {
        const value = {
            integer: 3,
            float: 3.5,
            text: 'hello',
            enabled: true,
            empty: null,
            nested: [1, 2.5, { answer: 42 }]
        };

        const encoded = compas_pb.data.AnyData.encode(encodeAnyData(value)).finish();
        const decoded = compas_pb.data.AnyData.decode(encoded);

        expect(decodeAnyData(decoded)).toEqual(value);
        expect(oneofOf(decoded.dictValue?.items?.integer)).toBe('intValue');
        expect(oneofOf(decoded.dictValue?.items?.float)).toBe('doubleValue');
    });

    it('writes and reads a v1 MessageData envelope', () => {
        const claim = antikythera.v1.TaskClaimRequest.encode({
            taskId: 'task-1',
            agentId: 'browser-agent'
        }).finish();
        const wireBytes = wrapMessage(claim, 'type.googleapis.com/antikythera.v1.TaskClaimRequest');
        const envelope = compas_pb.data.MessageData.decode(wireBytes);
        const inner = unwrapMessage(wireBytes);

        expect(envelope.version).toBe(COMPAS_PB_WIRE_VERSION);
        expect(inner?.type_url).toBe('type.googleapis.com/antikythera.v1.TaskClaimRequest');
        expect(antikythera.v1.TaskClaimRequest.decode(inner?.value as Uint8Array).taskId).toBe('task-1');
    });

    it('rejects an incompatible wire version', () => {
        const wireBytes = compas_pb.data.MessageData.encode({
            data: encodeAnyData('old'),
            version: '0.4.9'
        }).finish();

        expect(() => unwrapMessage(wireBytes)).toThrow('Unsupported compas_pb wire version: 0.4.9');
    });

    it('decodes a task serialized by compas_pb v1 in Python', () => {
        const wireBytes = Uint8Array.from(atob(PYTHON_V1_TASK), character => character.charCodeAt(0));
        const inner = unwrapMessage(wireBytes);
        const message = antikythera.v1.TaskAssignmentMessage.decode(inner?.value as Uint8Array);
        const task = new Task(message);

        expect(inner?.type_url).toBe('type.googleapis.com/antikythera.v1.TaskAssignmentMessage');
        expect(task.id).toBe('python-wire');
        expect(task.inputs).toEqual({
            integer: 3,
            float: 3.5,
            nested: [true, { text: 'hello' }]
        });
    });
});

// Ported from anyDataCodec.test.ts, which this module absorbed. The wire shapes are v1's
// (native list/dict arms instead of google.protobuf.Any), but the encoding *rules* under test
// are the ones issue-sim-04 established for authored task outputs.
describe('AnyData encoding rules for authored outputs', () => {
    it('round-trips primitives, keeping int and float distinct', () => {
        expect(decodeAnyData(encodeAnyData('hello'))).toBe('hello');
        expect(decodeAnyData(encodeAnyData(42))).toBe(42);
        expect(decodeAnyData(encodeAnyData(1.5))).toBe(1.5);
        expect(decodeAnyData(encodeAnyData(true))).toBe(true);
        expect(decodeAnyData(encodeAnyData(false))).toBe(false);
        expect(oneofOf(encodeAnyData(42))).toBe('intValue');
        expect(oneofOf(encodeAnyData(1.5))).toBe('doubleValue');
    });

    it('encodes null/undefined as nullValue and decodes back to null', () => {
        expect(decodeAnyData(encodeAnyData(null))).toBeNull();
        expect(decodeAnyData(encodeAnyData(undefined))).toBeNull();
    });

    it('round-trips bytes through the "base64:" string convention', () => {
        const value = new Uint8Array([0, 1, 250, 255]);
        expect(encodeAnyData(value).value?.stringValue).toBe('base64:AAH6/w==');
        expect(decodeAnyData(encodeAnyData(value))).toEqual(value);
    });

    it('round-trips lists via the native listValue arm', () => {
        const encoded = encodeAnyData(['a', 1, true]);
        expect(oneofOf(encoded)).toBe('listValue');
        expect(encoded.message).toBeUndefined();
        expect(decodeAnyData(encoded)).toEqual(['a', 1, true]);
        expect(decodeAnyData(encodeAnyData([[1, 2], [3]]))).toEqual([[1, 2], [3]]);
    });

    it('round-trips a plain dict (no dtype) via dictValue, not fallback', () => {
        const value = { a: 1, b: 'two', c: [1, 2, 3] };
        const encoded = encodeAnyData(value);
        expect(oneofOf(encoded)).toBe('dictValue');
        expect(encoded.fallback).toBeUndefined();
        expect(decodeAnyData(encoded)).toEqual(value);
    });

    it('wraps a COMPAS envelope ({dtype, data}) in FallbackData rather than dictValue', () => {
        const value = { dtype: 'compas.geometry.Frame', data: { point: [0, 0, 0], xaxis: [1, 0, 0], yaxis: [0, 1, 0] } };
        const encoded = encodeAnyData(value);

        // Only the fallback arm runs DataDecoder backend-side (compas_pb.core
        // _deserialize_fallback); _deserialize_dict would hand Python a bare dict instead.
        expect(oneofOf(encoded)).toBe('fallback');
        expect(encoded.dictValue).toBeUndefined();
        expect(decodeAnyData(encoded)).toEqual(value);
    });

    it('wraps only the enveloped items of a list, leaving the list itself a listValue', () => {
        const value = [
            { dtype: 'compas.geometry.Point', data: { x: 0, y: 0, z: 0 } },
            { dtype: 'compas.geometry.Point', data: { x: 1, y: 1, z: 1 } }
        ];
        const encoded = encodeAnyData(value);
        expect(oneofOf(encoded)).toBe('listValue');
        for (const item of encoded.listValue?.items ?? []) {
            expect(oneofOf(item)).toBe('fallback');
        }
        expect(decodeAnyData(encoded)).toEqual(value);
    });

    it('does not mistake a dict for an envelope because a nested value is envelope-shaped', () => {
        const value = { label: 'ok', nested: { dtype: 'compas.geometry.Point', data: {} } };
        const encoded = encodeAnyData(value);
        expect(oneofOf(encoded)).toBe('dictValue');
        expect(oneofOf(encoded.dictValue?.items?.nested)).toBe('fallback');
        expect(decodeAnyData(encoded)).toEqual(value);
    });

    it('decodes incoming FallbackData into a plain dict without constructing any object', () => {
        const anyData: compas_pb.data.IAnyData = {
            fallback: { data: { items: { dtype: { value: { stringValue: 'compas.geometry.Frame' } } } } }
        };
        expect(decodeAnyData(anyData)).toEqual({ dtype: 'compas.geometry.Frame' });
    });

    it('still decodes legacy containers packed under google.protobuf.Any', () => {
        const dictData = compas_pb.data.DictData.create({
            items: { x: { value: { numberValue: 1 } }, y: { value: { stringValue: 'ok' } } }
        });
        expect(decodeAnyData({
            message: {
                type_url: 'type.googleapis.com/compas_pb.data.DictData',
                value: compas_pb.data.DictData.encode(dictData).finish()
            }
        })).toEqual({ x: 1, y: 'ok' });

        const listData = compas_pb.data.ListData.create({ items: [{ value: { stringValue: 'a' } }] });
        expect(decodeAnyData({
            message: {
                type_url: 'type.googleapis.com/compas_pb.data.ListData',
                value: compas_pb.data.ListData.encode(listData).finish()
            }
        })).toEqual(['a']);
    });

    it('returns null for an empty/unset AnyData', () => {
        expect(decodeAnyData({})).toBeNull();
        expect(decodeAnyData(null)).toBeNull();
        expect(decodeAnyData(undefined)).toBeNull();
    });
});
