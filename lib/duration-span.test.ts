import { describe, it, expect } from 'vitest';
import { MS_PER_DAY, isoDayIndex, dateDayIndex, italianDaySpan } from './duration-span';

describe('isoDayIndex', () => {
  it('returns the UTC day index for a plain YYYY-MM-DD', () => {
    expect(isoDayIndex('1970-01-01')).toBe(0);
    expect(isoDayIndex('1970-01-02')).toBe(1);
  });

  it('reads only the leading date prefix, ignoring any time suffix', () => {
    expect(isoDayIndex('1970-01-02T23:59:59.000Z')).toBe(1);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(isoDayIndex('  1970-01-02  ')).toBe(1);
  });

  it('returns null when there is no parseable YYYY-MM-DD prefix', () => {
    expect(isoDayIndex('')).toBeNull();
    expect(isoDayIndex('not-a-date')).toBeNull();
    expect(isoDayIndex('2024/11/18')).toBeNull();
    expect(isoDayIndex('24-11-18')).toBeNull();
  });

  it('two dates differ by their whole-day gap', () => {
    const a = isoDayIndex('2024-11-02')!;
    const b = isoDayIndex('2024-11-25')!;
    expect(b - a).toBe(23);
  });
});

describe('dateDayIndex', () => {
  it('maps an instant to its UTC calendar-day index', () => {
    expect(dateDayIndex(new Date('1970-01-01T00:00:00.000Z'))).toBe(0);
    expect(dateDayIndex(new Date('1970-01-02T23:59:59.000Z'))).toBe(1);
  });

  it('agrees with isoDayIndex for the same UTC day', () => {
    expect(dateDayIndex(new Date('2024-11-18T12:00:00.000Z'))).toBe(isoDayIndex('2024-11-18'));
  });

  it('exposes MS_PER_DAY as one day of milliseconds', () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
  });
});

describe('italianDaySpan', () => {
  it('non-positive spans read "meno di un giorno"', () => {
    expect(italianDaySpan(0)).toBe('meno di un giorno');
    expect(italianDaySpan(-5)).toBe('meno di un giorno');
  });

  it('singular / plural days up to a week', () => {
    expect(italianDaySpan(1)).toBe('1 giorno');
    expect(italianDaySpan(3)).toBe('3 giorni');
    expect(italianDaySpan(6)).toBe('6 giorni');
  });

  it('weeks with singular / plural agreement', () => {
    expect(italianDaySpan(7)).toBe('1 settimana');
    expect(italianDaySpan(14)).toBe('2 settimane');
    expect(italianDaySpan(29)).toBe('4 settimane');
  });

  it('months with singular / plural agreement', () => {
    expect(italianDaySpan(30)).toBe('1 mese');
    expect(italianDaySpan(92)).toBe('3 mesi');
  });

  it('caps months at 11 so it never reads "12 mesi"', () => {
    expect(italianDaySpan(355)).toBe('11 mesi');
    expect(italianDaySpan(364)).toBe('11 mesi');
  });

  it('years with singular / plural agreement', () => {
    expect(italianDaySpan(365)).toBe('1 anno');
    expect(italianDaySpan(731)).toBe('2 anni');
  });
});
