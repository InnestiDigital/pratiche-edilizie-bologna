import { describe, it, expect } from 'vitest';
import { decodeStringArray, decodeEnumArray, decodeEnumValue } from './preferences-decode';
import { QUARTIERI, FILING_TYPE_ORDER } from './constants';
import { CATEGORIES } from './sources';
import { PERSONAS } from './personas';

const ZONE_FALLBACK = [...QUARTIERI];
const TYPE_FALLBACK = [...FILING_TYPE_ORDER];
const CATEGORY_FALLBACK = [...CATEGORIES];

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

  it('keeps every known category in stored order, dropping a stored dead/unknown one', () => {
    // 'ambiente' is not a member of CATEGORIES (a hypothetical future/removed
    // category); it degrades away while the real categories are preserved.
    const raw = JSON.stringify(['edilizia', 'ambiente', 'cantieri']);
    expect(decodeEnumArray(raw, CATEGORIES, CATEGORY_FALLBACK)).toEqual(['edilizia', 'cantieri']);
  });

  // decodeEnumArray returns whatever fallback the caller passes; this fixture
  // uses all CATEGORIES as the fallback. (The app's real corrupt-pref fallback
  // is edilizia-only — see DEFAULTS.interests — but that is a caller decision,
  // not this pure decoder's.)
  it('falls back to the caller-provided fallback when the stored value is missing/corrupt', () => {
    expect(decodeEnumArray('garbage', CATEGORIES, CATEGORY_FALLBACK)).toEqual(CATEGORY_FALLBACK);
    expect(decodeEnumArray('null', CATEGORIES, CATEGORY_FALLBACK)).toEqual(CATEGORY_FALLBACK);
    expect(decodeEnumArray('', CATEGORIES, CATEGORY_FALLBACK)).toEqual(CATEGORY_FALLBACK);
  });

  it('drops corrupt/unknown category values from stored interests instead of throwing', () => {
    const raw = JSON.stringify(['edilizia', 'Quartiere Fantasma', 1, null, {}]);
    expect(() => decodeEnumArray(raw, CATEGORIES, CATEGORY_FALLBACK)).not.toThrow();
    expect(decodeEnumArray(raw, CATEGORIES, CATEGORY_FALLBACK)).toEqual(['edilizia']);
  });

  it('yields an empty array when every stored interest value is unknown', () => {
    const raw = JSON.stringify(['ambiente', 'mobilita']);
    expect(decodeEnumArray(raw, CATEGORIES, CATEGORY_FALLBACK)).toEqual([]);
  });
});

describe('decodeEnumValue', () => {
  it('round-trips a stored known enum value', () => {
    expect(decodeEnumValue(JSON.stringify('compravendita'), PERSONAS, null)).toBe('compravendita');
    for (const p of PERSONAS) {
      expect(decodeEnumValue(JSON.stringify(p), PERSONAS, null)).toBe(p);
    }
  });

  it('maps a stored null (never chosen / cleared) to the fallback', () => {
    expect(decodeEnumValue('null', PERSONAS, null)).toBe(null);
    expect(decodeEnumValue(JSON.stringify(null), PERSONAS, 'esplora')).toBe('esplora');
  });

  it('degrades an unknown / legacy / removed value to the fallback', () => {
    expect(decodeEnumValue(JSON.stringify('giornalista'), PERSONAS, null)).toBe(null);
    expect(decodeEnumValue(JSON.stringify('giornalista'), PERSONAS, 'esplora')).toBe('esplora');
  });

  it('falls back on corrupt / non-JSON input instead of throwing', () => {
    expect(() => decodeEnumValue('{not json', PERSONAS, null)).not.toThrow();
    expect(decodeEnumValue('{not json', PERSONAS, null)).toBe(null);
    expect(decodeEnumValue('', PERSONAS, null)).toBe(null);
  });

  it('falls back when the parsed value is not a string (number / object / array)', () => {
    expect(decodeEnumValue('42', PERSONAS, null)).toBe(null);
    expect(decodeEnumValue('{"a":1}', PERSONAS, null)).toBe(null);
    expect(decodeEnumValue('["compravendita"]', PERSONAS, null)).toBe(null);
    expect(decodeEnumValue('true', PERSONAS, null)).toBe(null);
  });
});
