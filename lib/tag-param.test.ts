import { describe, it, expect } from 'vitest';
import { parseTagParam } from './tag-param';
import { TAG_LABELS } from './constants';

describe('parseTagParam', () => {
  it('returns the key for every canonical tag', () => {
    for (const key of Object.keys(TAG_LABELS)) {
      expect(parseTagParam(key)).toBe(key);
    }
  });

  it('normalizes the array form to its first element', () => {
    expect(parseTagParam(['sanatoria', 'deroga'])).toBe('sanatoria');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseTagParam('  con_lavori  ')).toBe('con_lavori');
  });

  it('returns null for undefined / empty / array-of-empty', () => {
    expect(parseTagParam(undefined)).toBeNull();
    expect(parseTagParam('')).toBeNull();
    expect(parseTagParam([])).toBeNull();
  });

  it('returns null for a human label instead of the key', () => {
    // The deep link carries the key (`con_lavori`), never the display label.
    expect(parseTagParam('Con lavori')).toBeNull();
    expect(parseTagParam('In deroga')).toBeNull();
  });

  it('returns null for an unknown or wrong-case tag', () => {
    expect(parseTagParam('inesistente')).toBeNull();
    expect(parseTagParam('Sanatoria')).toBeNull(); // case-sensitive on purpose
  });
});
