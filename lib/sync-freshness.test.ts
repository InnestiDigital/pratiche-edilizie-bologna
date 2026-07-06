import { describe, it, expect } from 'vitest';
import { syncFreshness, SYNC_FRESH_DAYS, SYNC_STALE_DAYS } from './sync-freshness';

/** Build an ISO timestamp exactly `days` (+ optional `hours`) before `now`. */
function isoDaysBefore(now: Date, days: number, hours = 0): string {
  return new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

const NOW = new Date('2026-07-03T12:00:00.000Z');

describe('syncFreshness — nullish / unparseable input', () => {
  it.each([null, undefined, '', '   '])('returns null for %p', (input) => {
    expect(syncFreshness(input, NOW)).toBeNull();
  });

  it('returns null for an unparseable date string', () => {
    expect(syncFreshness('not-a-date', NOW)).toBeNull();
  });
});

describe('syncFreshness — relative label', () => {
  it('same instant → "oggi"', () => {
    expect(syncFreshness(NOW.toISOString(), NOW)?.label).toBe('oggi');
  });

  it('a few hours ago (< 1 day) → "oggi"', () => {
    expect(syncFreshness(isoDaysBefore(NOW, 0, 5), NOW)?.label).toBe('oggi');
  });

  it('a future/skewed stamp → "oggi", days clamped to 0', () => {
    const f = syncFreshness(isoDaysBefore(NOW, -3), NOW);
    expect(f?.label).toBe('oggi');
    expect(f?.days).toBe(0);
    expect(f?.stale).toBe(false);
  });

  it('1 day → "ieri"', () => {
    expect(syncFreshness(isoDaysBefore(NOW, 1), NOW)?.label).toBe('ieri');
  });

  it.each([2, 3, 6])('%i days → "N giorni fa"', (d) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.label).toBe(`${d} giorni fa`);
  });

  it.each([7, 13])('%i days → "1 settimana fa"', (d) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.label).toBe('1 settimana fa');
  });

  it.each([
    [14, '2 settimane fa'],
    [21, '3 settimane fa'],
    [29, '4 settimane fa'],
  ])('%i days → "%s"', (d, label) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.label).toBe(label);
  });

  it.each([
    [30, '1 mese fa'],
    [59, '1 mese fa'],
    [60, '2 mesi fa'],
    [364, '11 mesi fa'], // capped at 11 — never "12 mesi fa"
  ])('%i days → "%s"', (d, label) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.label).toBe(label);
  });

  it.each([
    [365, '1 anno fa'],
    [729, '1 anno fa'],
    [730, '2 anni fa'],
    [1200, '3 anni fa'],
  ])('%i days → "%s"', (d, label) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.label).toBe(label);
  });
});

describe('syncFreshness — staleness flag', () => {
  it(`fresh just below the ${SYNC_STALE_DAYS}-day threshold`, () => {
    expect(syncFreshness(isoDaysBefore(NOW, SYNC_STALE_DAYS - 1), NOW)?.stale).toBe(false);
  });

  it(`stale exactly at the ${SYNC_STALE_DAYS}-day threshold`, () => {
    expect(syncFreshness(isoDaysBefore(NOW, SYNC_STALE_DAYS), NOW)?.stale).toBe(true);
  });

  it('stale well beyond the threshold', () => {
    expect(syncFreshness(isoDaysBefore(NOW, 400), NOW)?.stale).toBe(true);
  });
});

describe('syncFreshness — semantic tier', () => {
  it('a same-instant / same-day sync is fresh', () => {
    expect(syncFreshness(NOW.toISOString(), NOW)?.tier).toBe('fresh');
  });

  it('a future/skewed stamp (days clamped to 0) is fresh, never stale', () => {
    expect(syncFreshness(isoDaysBefore(NOW, -5), NOW)?.tier).toBe('fresh');
  });

  it.each([0, 1, SYNC_FRESH_DAYS - 1])('%i days → fresh', (d) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.tier).toBe('fresh');
  });

  it(`crosses to recent exactly at the ${SYNC_FRESH_DAYS}-day fresh threshold`, () => {
    expect(syncFreshness(isoDaysBefore(NOW, SYNC_FRESH_DAYS), NOW)?.tier).toBe('recent');
  });

  it.each([SYNC_FRESH_DAYS, 14, SYNC_STALE_DAYS - 1])('%i days → recent', (d) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.tier).toBe('recent');
  });

  it(`crosses to stale exactly at the ${SYNC_STALE_DAYS}-day stale threshold`, () => {
    expect(syncFreshness(isoDaysBefore(NOW, SYNC_STALE_DAYS), NOW)?.tier).toBe('stale');
  });

  it.each([SYNC_STALE_DAYS, 90, 400])('%i days → stale', (d) => {
    expect(syncFreshness(isoDaysBefore(NOW, d), NOW)?.tier).toBe('stale');
  });

  it('tier and the stale convenience flag agree', () => {
    for (const d of [0, 6, 7, 29, 30, 400]) {
      const f = syncFreshness(isoDaysBefore(NOW, d), NOW);
      expect(f?.stale).toBe(f?.tier === 'stale');
    }
  });
});
