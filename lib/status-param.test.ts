import { describe, it, expect } from 'vitest';
import { parseStatusParam } from './status-param';
import { STATUS_LABELS } from './constants';

describe('parseStatusParam', () => {
  it('returns the key for every canonical status', () => {
    for (const key of Object.keys(STATUS_LABELS)) {
      expect(parseStatusParam(key)).toBe(key);
    }
  });

  it('normalizes the array form to its first element', () => {
    expect(parseStatusParam(['rilasciata', 'diniegata'])).toBe('rilasciata');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseStatusParam('  in_attesa  ')).toBe('in_attesa');
  });

  it('returns null for undefined / empty / array-of-empty', () => {
    expect(parseStatusParam(undefined)).toBeNull();
    expect(parseStatusParam('')).toBeNull();
    expect(parseStatusParam([])).toBeNull();
  });

  it('returns null for a human label instead of the key', () => {
    // The deep link carries the key (`in_attesa`), never the display label.
    expect(parseStatusParam('In attesa')).toBeNull();
    expect(parseStatusParam('Rilasciata con prescrizioni')).toBeNull();
  });

  it('returns null for an unknown or wrong-case status', () => {
    expect(parseStatusParam('inesistente')).toBeNull();
    expect(parseStatusParam('Rilasciata')).toBeNull(); // case-sensitive on purpose
  });
});
