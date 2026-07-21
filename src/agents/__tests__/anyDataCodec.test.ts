import { describe, it, expect } from 'vitest';
import { encodeAnyData, decodeAnyData } from '../anyDataCodec';
import { compas_pb } from '../../proto/bundle';

describe('anyDataCodec (issue-sim-04 wire encoding)', () => {
  it('round-trips primitives through AnyData.value', () => {
    expect(decodeAnyData(encodeAnyData('hello'))).toBe('hello');
    expect(decodeAnyData(encodeAnyData(42))).toBe(42);
    expect(decodeAnyData(encodeAnyData(1.5))).toBe(1.5);
    expect(decodeAnyData(encodeAnyData(true))).toBe(true);
    expect(decodeAnyData(encodeAnyData(false))).toBe(false);
  });

  it('encodes null/undefined as AnyData.value.nullValue and decodes back to null', () => {
    expect(decodeAnyData(encodeAnyData(null))).toBeNull();
    expect(decodeAnyData(encodeAnyData(undefined))).toBeNull();
  });

  it('round-trips a list of primitives via ListData under AnyData.message', () => {
    const encoded = encodeAnyData(['a', 1, true]);
    expect(encoded.message?.type_url).toBe('type.googleapis.com/compas_pb.data.ListData');
    expect(decodeAnyData(encoded)).toEqual(['a', 1, true]);
  });

  it('round-trips nested lists', () => {
    const value = [[1, 2], [3]];
    expect(decodeAnyData(encodeAnyData(value))).toEqual(value);
  });

  it('round-trips a plain dict (no dtype) via DictData under AnyData.message, not fallback', () => {
    const value = { a: 1, b: 'two', c: [1, 2, 3] };
    const encoded = encodeAnyData(value);
    expect(encoded.fallback).toBeUndefined();
    expect(encoded.message?.type_url).toBe('type.googleapis.com/compas_pb.data.DictData');
    expect(decodeAnyData(encoded)).toEqual(value);
  });

  it('wraps a COMPAS envelope ({dtype, data}) in FallbackData rather than DictData', () => {
    const value = { dtype: 'compas.geometry.Frame', data: { point: [0, 0, 0], xaxis: [1, 0, 0], yaxis: [0, 1, 0] } };
    const encoded = encodeAnyData(value);

    expect(encoded.message).toBeUndefined();
    expect(encoded.fallback).toBeDefined();
    // The decoded shape a plain frontend agent sees back is the same dict — reconstruction into
    // the actual COMPAS object happens backend-side (compas_pb.core._deserialize_fallback ->
    // DataDecoder), which this test cannot exercise without a live backend (see issue-sim-04's
    // docker-compose verification step for that).
    expect(decodeAnyData(encoded)).toEqual(value);
  });

  it('wraps only the enveloped items of a list, leaving the list itself as ListData', () => {
    const value = [
      { dtype: 'compas.geometry.Point', data: { x: 0, y: 0, z: 0 } },
      { dtype: 'compas.geometry.Point', data: { x: 1, y: 1, z: 1 } },
    ];
    const encoded = encodeAnyData(value);
    expect(encoded.message?.type_url).toBe('type.googleapis.com/compas_pb.data.ListData');

    const listData = compas_pb.data.ListData.decode(encoded.message!.value as Uint8Array);
    for (const item of listData.items ?? []) {
      expect(item.fallback).toBeDefined();
      expect(item.message == null).toBe(true);
    }
    expect(decodeAnyData(encoded)).toEqual(value);
  });

  it('a dict-typed output containing a nested dtype-shaped value is not itself mistaken for an envelope', () => {
    // Top-level object has no "dtype" of its own, so it stays a plain DictData, even though one
    // of its values happens to be envelope-shaped.
    const value = { label: 'ok', nested: { dtype: 'compas.geometry.Point', data: {} } };
    const encoded = encodeAnyData(value);
    expect(encoded.fallback).toBeUndefined();
    expect(encoded.message?.type_url).toBe('type.googleapis.com/compas_pb.data.DictData');
    expect(decodeAnyData(encoded)).toEqual(value);
  });

  it('decodes an incoming DictData wrapped directly under AnyData.message (how the backend sends a plain dict param)', () => {
    const dictData = compas_pb.data.DictData.create({
      items: { x: { value: { numberValue: 1 } }, y: { value: { stringValue: 'ok' } } },
    });
    const anyData: compas_pb.data.IAnyData = {
      message: {
        type_url: 'type.googleapis.com/compas_pb.data.DictData',
        value: compas_pb.data.DictData.encode(dictData).finish(),
      },
    };
    expect(decodeAnyData(anyData)).toEqual({ x: 1, y: 'ok' });
  });

  it('decodes an incoming FallbackData into a plain dict without constructing any object', () => {
    const dictData = compas_pb.data.DictData.create({
      items: { dtype: { value: { stringValue: 'compas.geometry.Frame' } } },
    });
    const anyData: compas_pb.data.IAnyData = { fallback: { data: dictData } };
    expect(decodeAnyData(anyData)).toEqual({ dtype: 'compas.geometry.Frame' });
  });

  it('decodeAnyData returns null for an empty/unset AnyData', () => {
    expect(decodeAnyData({})).toBeNull();
    expect(decodeAnyData(null)).toBeNull();
    expect(decodeAnyData(undefined)).toBeNull();
  });
});
