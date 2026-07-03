import { describe, it, expect } from 'vitest';
import { pendingDurationLabel } from './pending-duration';

/** Fixed reference clock: 2025-06-15T12:00:00Z. */
const NOW = new Date('2025-06-15T12:00:00.000Z');

describe('pendingDurationLabel', () => {
  it('returns null for missing / empty / unparseable request dates', () => {
    expect(pendingDurationLabel(null, NOW)).toBeNull();
    expect(pendingDurationLabel(undefined, NOW)).toBeNull();
    expect(pendingDurationLabel('', NOW)).toBeNull();
    expect(pendingDurationLabel('   ', NOW)).toBeNull();
    expect(pendingDurationLabel('not-a-date', NOW)).toBeNull();
  });

  it('same day → "meno di un giorno"', () => {
    expect(pendingDurationLabel('2025-06-15', NOW)).toBe('In attesa da meno di un giorno');
  });

  it('clamps a future / clock-skewed request date to "meno di un giorno"', () => {
    expect(pendingDurationLabel('2025-08-01', NOW)).toBe('In attesa da meno di un giorno');
  });

  it('singular day', () => {
    expect(pendingDurationLabel('2025-06-14', NOW)).toBe('In attesa da 1 giorno');
  });

  it('plural days up to a week', () => {
    expect(pendingDurationLabel('2025-06-12', NOW)).toBe('In attesa da 3 giorni');
    expect(pendingDurationLabel('2025-06-09', NOW)).toBe('In attesa da 6 giorni');
  });

  it('weeks with singular / plural agreement', () => {
    expect(pendingDurationLabel('2025-06-08', NOW)).toBe('In attesa da 1 settimana'); // 7 days
    expect(pendingDurationLabel('2025-06-01', NOW)).toBe('In attesa da 2 settimane'); // 14 days
    expect(pendingDurationLabel('2025-05-25', NOW)).toBe('In attesa da 3 settimane'); // 21 days
  });

  it('months with singular / plural agreement', () => {
    expect(pendingDurationLabel('2025-05-15', NOW)).toBe('In attesa da 1 mese'); // 31 days
    expect(pendingDurationLabel('2025-03-15', NOW)).toBe('In attesa da 3 mesi'); // ~92 days
  });

  it('caps months at 11 so it never reads "12 mesi"', () => {
    // 2024-06-25 → 355 days: floor(355/30)=11, still < 365 → "11 mesi", not "12 mesi".
    expect(pendingDurationLabel('2024-06-25', NOW)).toBe('In attesa da 11 mesi');
  });

  it('years with singular / plural agreement', () => {
    expect(pendingDurationLabel('2024-06-15', NOW)).toBe('In attesa da 1 anno'); // 365 days
    expect(pendingDurationLabel('2023-06-15', NOW)).toBe('In attesa da 2 anni'); // ~731 days
  });

  it('ignores a time suffix on the request value (date-only prefix drives the span)', () => {
    expect(pendingDurationLabel('2025-06-14T23:59:59.000Z', NOW)).toBe('In attesa da 1 giorno');
  });

  it('is timezone-stable for a date-only value regardless of the local now instant', () => {
    // now late in the UTC day vs early — both land on the same UTC calendar day,
    // so a request three UTC days earlier reads "3 giorni" either way.
    const early = new Date('2025-06-15T00:30:00.000Z');
    const late = new Date('2025-06-15T23:30:00.000Z');
    expect(pendingDurationLabel('2025-06-12', early)).toBe('In attesa da 3 giorni');
    expect(pendingDurationLabel('2025-06-12', late)).toBe('In attesa da 3 giorni');
  });
});
