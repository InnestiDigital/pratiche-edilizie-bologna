import { describe, it, expect } from 'vitest';
import { processingDurationLabel } from './processing-duration';

describe('processingDurationLabel', () => {
  it('returns null when either date is missing / empty', () => {
    expect(processingDurationLabel(null, '2024-11-25')).toBeNull();
    expect(processingDurationLabel('2024-11-02', null)).toBeNull();
    expect(processingDurationLabel(undefined, '2024-11-25')).toBeNull();
    expect(processingDurationLabel('2024-11-02', undefined)).toBeNull();
    expect(processingDurationLabel('', '2024-11-25')).toBeNull();
    expect(processingDurationLabel('2024-11-02', '   ')).toBeNull();
  });

  it('returns null when either date is unparseable', () => {
    expect(processingDurationLabel('not-a-date', '2024-11-25')).toBeNull();
    expect(processingDurationLabel('2024-11-02', 'boh')).toBeNull();
  });

  it('returns null when the closing date is before the request (messy data)', () => {
    // Mirrors the Marconi fixture: date_issued 15/11 predates richiesta 18/11.
    expect(processingDurationLabel('2024-11-18', '2024-11-15')).toBeNull();
  });

  it('same-day request and closing → "meno di un giorno"', () => {
    expect(processingDurationLabel('2024-11-02', '2024-11-02')).toBe(
      'Conclusa in meno di un giorno'
    );
  });

  it('builds the span for a valid request → closing gap', () => {
    // Via Saragozza 118 fixture: 02/11 → 25/11 = 23 days = 3 weeks.
    expect(processingDurationLabel('2024-11-02', '2024-11-25')).toBe('Conclusa in 3 settimane');
  });

  it('singular day', () => {
    expect(processingDurationLabel('2024-11-02', '2024-11-03')).toBe('Conclusa in 1 giorno');
  });

  it('months with plural agreement', () => {
    expect(processingDurationLabel('2024-08-15', '2024-11-15')).toBe('Conclusa in 3 mesi'); // 92 days
  });

  it('years with plural agreement', () => {
    expect(processingDurationLabel('2022-01-01', '2024-01-01')).toBe('Conclusa in 2 anni');
  });

  it('ignores time suffixes on either value (date-only prefix drives the span)', () => {
    expect(processingDurationLabel('2024-11-02T08:00:00.000Z', '2024-11-03T23:59:59.000Z')).toBe(
      'Conclusa in 1 giorno'
    );
  });
});
