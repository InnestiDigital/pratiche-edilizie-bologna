import { describe, it, expect } from 'vitest';
import { periodStartDate, PERIOD_LABELS, FEED_PERIOD_ORDER, type FeedPeriod } from './feed-period';

// Build the reference date from LOCAL calendar components (not an ISO string), so
// periodStartDate reads back the exact year/month/day here regardless of timezone.
const at = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d);

describe('periodStartDate', () => {
  it('returns null for the "all" period (no bound)', () => {
    expect(periodStartDate('all', at(2026, 7, 3))).toBeNull();
  });

  it('subtracts whole calendar months for each bounded period', () => {
    const now = at(2026, 7, 3);
    expect(periodStartDate('last_month', now)).toBe('2026-06-03');
    expect(periodStartDate('last_3_months', now)).toBe('2026-04-03');
    expect(periodStartDate('last_6_months', now)).toBe('2026-01-03');
    expect(periodStartDate('last_year', now)).toBe('2025-07-03');
  });

  it('rolls the year back when the subtraction crosses January', () => {
    expect(periodStartDate('last_3_months', at(2026, 1, 15))).toBe('2025-10-15');
    expect(periodStartDate('last_6_months', at(2026, 2, 10))).toBe('2025-08-10');
  });

  it('clamps the day to the target month length (non-leap February)', () => {
    // 31 Mar 2026 − 1 month → Feb has 28 days in 2026 → clamp to the 28th.
    expect(periodStartDate('last_month', at(2026, 3, 31))).toBe('2026-02-28');
  });

  it('clamps to 29 Feb in a leap year', () => {
    expect(periodStartDate('last_month', at(2024, 3, 31))).toBe('2024-02-29');
  });

  it('zero-pads single-digit months and days', () => {
    expect(periodStartDate('last_month', at(2026, 2, 5))).toBe('2026-01-05');
  });

  it('produces a bound that is lexicographically <= the reference date', () => {
    const iso = (y: number, m1: number, d: number) =>
      `${y}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const nowIso = iso(2026, 7, 3);
    for (const p of FEED_PERIOD_ORDER) {
      const bound = periodStartDate(p, at(2026, 7, 3));
      if (bound !== null) expect(bound <= nowIso).toBe(true);
    }
  });
});

describe('period metadata', () => {
  it('has a non-empty label for every period', () => {
    for (const p of FEED_PERIOD_ORDER) {
      expect(PERIOD_LABELS[p]).toBeTruthy();
    }
  });

  it('lists "all" first in the display order', () => {
    expect(FEED_PERIOD_ORDER[0]).toBe<FeedPeriod>('all');
  });

  it('order covers exactly the labelled periods with no duplicates', () => {
    expect(new Set(FEED_PERIOD_ORDER).size).toBe(FEED_PERIOD_ORDER.length);
    expect(new Set(FEED_PERIOD_ORDER)).toEqual(new Set(Object.keys(PERIOD_LABELS)));
  });
});
