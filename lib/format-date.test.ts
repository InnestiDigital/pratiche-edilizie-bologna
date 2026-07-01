import { describe, it, expect } from 'vitest';
import { formatItDate } from './format-date';

describe('formatItDate', () => {
  it('formats a plain YYYY-MM-DD as dd/mm/yyyy', () => {
    expect(formatItDate('2024-03-15')).toBe('15/03/2024');
  });

  it('formats a full ISO datetime using only its date part', () => {
    expect(formatItDate('2024-03-15T00:00:00+00:00')).toBe('15/03/2024');
    expect(formatItDate('2023-12-01T23:59:59Z')).toBe('01/12/2023');
  });

  it('is timezone-safe: never shifts to an adjacent day', () => {
    // A naive `new Date('2024-01-01').toLocaleDateString()` west of UTC yields
    // 31/12/2023. The pure part-lifting must keep the literal day.
    expect(formatItDate('2024-01-01')).toBe('01/01/2024');
  });

  it('preserves zero-padding of the source', () => {
    expect(formatItDate('2024-07-02')).toBe('02/07/2024');
  });

  it('returns null for null / undefined', () => {
    expect(formatItDate(null)).toBeNull();
    expect(formatItDate(undefined)).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(formatItDate('')).toBeNull();
    expect(formatItDate('   ')).toBeNull();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(formatItDate('  2024-03-15  ')).toBe('15/03/2024');
  });

  it('falls back to the trimmed raw string when unparseable (never Invalid Date)', () => {
    expect(formatItDate('non una data')).toBe('non una data');
    expect(formatItDate('  15/03/2024  ')).toBe('15/03/2024');
    expect(formatItDate('2024')).toBe('2024');
    expect(formatItDate('2024-3-5')).toBe('2024-3-5'); // not zero-padded → no match, returned raw
  });

  it('never throws on odd input', () => {
    expect(() => formatItDate('\t\n')).not.toThrow();
    expect(() => formatItDate('0000-00-00')).not.toThrow();
    expect(formatItDate('0000-00-00')).toBe('00/00/0000');
  });
});
