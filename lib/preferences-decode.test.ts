import { describe, it, expect } from 'vitest';
import { decodeStringArray, decodeEnumArray } from './preferences-decode';
import { QUARTIERI, FILING_TYPE_ORDER } from './constants';

const ZONE_FALLBACK = [...QUARTIERI];
const TYPE_FALLBACK = [...FILING_TYPE_ORDER];

describe('decodeStringArray', () => {
  it('parses a well-formed JSON string array', () => {
    expect(decodeStringArray('["a","b","c"]', ['x'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves a valid empty array (user intent, not a fallback)', () => {
    expect(decodeStringArray('[]', ['x', 'y'])).toEqual([]);
  });

  it('falls back on corrupt / non-JSON input instead of throwing', () => {
    expect(() => decodeStringArray('{not json', ['x'])).not.toThrow();
    expect(decodeStringArray('{not json', ['x'])).toEqual(['x']);
    expect(decodeStringArray('', ['x'])).toEqual(['x']);
  });

  it('falls back when the parsed value is not an array', () => {
    expect(decodeStringArray('"just a string"', ['x'])).toEqual(['x']);
    expect(decodeStringArray('42', ['x'])).toEqual(['x']);
    expect(decodeStringArray('null', ['x'])).toEqual(['x']);
    expect(decodeStringArray('{"a":1}', ['x'])).toEqual(['x']);
  });

  it('drops non-string entries from an otherwise valid array', () => {
    expect(decodeStringArray('["a",1,null,"b",true,{}]', ['x'])).toEqual(['a', 'b']);
  });

  it('returns a copy of the fallback, not the same reference', () => {
    const fallback = ['x', 'y'];
    const out = decodeStringArray('nope', fallback);
    expect(out).toEqual(fallback);
    expect(out).not.toBe(fallback);
  });
});

describe('decodeEnumArray', () => {
  it('keeps known domain values in stored order', () => {
    const raw = JSON.stringify(['Navile', 'Savena']);
    expect(decodeEnumArray(raw, QUARTIERI, ZONE_FALLBACK)).toEqual(['Navile', 'Savena']);
  });

  it('drops values not in the allowed set (renamed / removed constant)', () => {
    const raw = JSON.stringify(['Navile', 'Quartiere Fantasma', 'Savena']);
    expect(decodeEnumArray(raw, QUARTIERI, ZONE_FALLBACK)).toEqual(['Navile', 'Savena']);
  });

  it('yields an empty array when every stored value is unknown', () => {
    const raw = JSON.stringify(['Ghost', 'Nope']);
    expect(decodeEnumArray(raw, QUARTIERI, ZONE_FALLBACK)).toEqual([]);
  });

  it('preserves a valid empty array', () => {
    expect(decodeEnumArray('[]', QUARTIERI, ZONE_FALLBACK)).toEqual([]);
  });

  it('falls back to defaults on corrupt input', () => {
    expect(decodeEnumArray('garbage', QUARTIERI, ZONE_FALLBACK)).toEqual(ZONE_FALLBACK);
    expect(decodeEnumArray('null', QUARTIERI, ZONE_FALLBACK)).toEqual(ZONE_FALLBACK);
  });

  it('works for filing types', () => {
    const raw = JSON.stringify(['SCIA', 'BOGUS', 'PDC']);
    expect(decodeEnumArray(raw, FILING_TYPE_ORDER, TYPE_FALLBACK)).toEqual(['SCIA', 'PDC']);
  });
});
