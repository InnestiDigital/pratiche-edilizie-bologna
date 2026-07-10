import { describe, it, expect } from 'vitest';
import {
  buildMonthlyActivity,
  monthlyActivityRangeLabel,
  monthlyActivityWindowTotal,
  MONTHLY_ACTIVITY_WINDOW,
  MONTHLY_ACTIVITY_MIN_WINDOW,
  MONTHLY_ACTIVITY_MAX_WINDOW,
} from './monthly-activity';

describe('buildMonthlyActivity', () => {
  it('returns an empty list for an empty map', () => {
    expect(buildMonthlyActivity({})).toEqual([]);
  });

  it('returns exactly `months` entries anchored to the latest data month', () => {
    // Latest month present is 2024-11 → trailing 6 = giu..nov 2024.
    const out = buildMonthlyActivity({ '2024-11': 3, '2024-08': 1, '2024-07': 1, '2024-06': 1 }, 6);
    expect(out.map((e) => e.monthKey)).toEqual([
      '2024-06',
      '2024-07',
      '2024-08',
      '2024-09',
      '2024-10',
      '2024-11',
    ]);
    expect(out.map((e) => e.count)).toEqual([1, 1, 1, 0, 0, 3]);
  });

  it('anchors to the most recent month, not the wall clock (works on stale data)', () => {
    const out = buildMonthlyActivity({ '2023-10': 2, '2023-12': 1 }, 4);
    // Latest is 2023-12 → set..dic 2023.
    expect(out[out.length - 1].monthKey).toBe('2023-12');
    expect(out.map((e) => e.monthKey)).toEqual(['2023-09', '2023-10', '2023-11', '2023-12']);
  });

  it('fills gaps between months with zero counts', () => {
    const out = buildMonthlyActivity({ '2024-11': 5, '2024-09': 2 }, 3);
    expect(out.map((e) => e.count)).toEqual([2, 0, 5]); // set, ott(gap), nov
  });

  it('rolls the window back across a year boundary', () => {
    const out = buildMonthlyActivity({ '2025-01': 4 }, 3);
    expect(out.map((e) => e.monthKey)).toEqual(['2024-11', '2024-12', '2025-01']);
  });

  it('labels months with Italian abbreviations', () => {
    const out = buildMonthlyActivity({ '2024-03': 1 }, 1);
    expect(out[0].label).toBe('mar');
    expect(out[0].year).toBe(2024);
  });

  it('computes pct relative to the busiest month and flags the peak', () => {
    const out = buildMonthlyActivity({ '2024-11': 4, '2024-10': 1, '2024-09': 2 }, 3);
    const byKey = Object.fromEntries(out.map((e) => [e.monthKey, e]));
    expect(byKey['2024-11'].pct).toBe(100);
    expect(byKey['2024-11'].isPeak).toBe(true);
    expect(byKey['2024-09'].pct).toBe(50);
    expect(byKey['2024-09'].isPeak).toBe(false);
    expect(byKey['2024-10'].pct).toBe(25);
  });

  it('flags every month that ties the peak count', () => {
    const out = buildMonthlyActivity({ '2024-11': 3, '2024-10': 3 }, 2);
    expect(out.every((e) => e.isPeak)).toBe(true);
  });

  it('gives zero-count months pct 0 (baseline, not missing)', () => {
    const out = buildMonthlyActivity({ '2024-11': 2, '2024-09': 1 }, 3);
    expect(out.find((e) => e.monthKey === '2024-10')?.pct).toBe(0);
  });

  it('drops malformed month keys and non-positive/NaN/Infinity counts', () => {
    const out = buildMonthlyActivity(
      {
        '2024-11': 2,
        '2024-13': 9, // invalid month
        'not-a-month': 5,
        '2024-10': 0, // zero → dropped from data (still rendered as a gap)
        '2024-09': -4, // negative
        '2024-08': Number.NaN,
        '2024-07': Number.POSITIVE_INFINITY,
      },
      6
    );
    // Only 2024-11 survives as real data → it is the anchor and the sole non-zero bar.
    expect(out[out.length - 1].monthKey).toBe('2024-11');
    expect(out.filter((e) => e.count > 0).map((e) => e.monthKey)).toEqual(['2024-11']);
  });

  it('floors fractional counts', () => {
    const out = buildMonthlyActivity({ '2024-11': 2.9 }, 1);
    expect(out[0].count).toBe(2);
  });

  it('returns [] for a non-positive or non-finite window', () => {
    expect(buildMonthlyActivity({ '2024-11': 3 }, 0)).toEqual([]);
    expect(buildMonthlyActivity({ '2024-11': 3 }, -2)).toEqual([]);
    expect(buildMonthlyActivity({ '2024-11': 3 }, Number.NaN)).toEqual([]);
  });

  it('defaults to the min window when the data spans fewer months', () => {
    const out = buildMonthlyActivity({ '2024-11': 1 });
    expect(out).toHaveLength(MONTHLY_ACTIVITY_WINDOW);
    expect(MONTHLY_ACTIVITY_MIN_WINDOW).toBe(MONTHLY_ACTIVITY_WINDOW);
  });

  describe('adaptive window (no explicit `months`)', () => {
    it('snaps the window to the data span so older months are not dropped', () => {
      // Span 2024-06 → 2024-11 = 6 months; a wider span must widen the window.
      // 2024-03 → 2024-11 = 9 months, inside [MIN=6, MAX=12] → 9 bars, all shown.
      const out = buildMonthlyActivity({ '2024-11': 3, '2024-03': 2, '2024-06': 1 });
      expect(out).toHaveLength(9);
      expect(out[0].monthKey).toBe('2024-03');
      expect(out[out.length - 1].monthKey).toBe('2024-11');
      // Every stored record is now represented (nothing rolled off).
      expect(monthlyActivityWindowTotal(out)).toBe(6);
    });

    it('floors a narrow span at the min window', () => {
      // Span 2024-10 → 2024-11 = 2 months < MIN → still MIN bars.
      const out = buildMonthlyActivity({ '2024-11': 2, '2024-10': 1 });
      expect(out).toHaveLength(MONTHLY_ACTIVITY_MIN_WINDOW);
      expect(out[out.length - 1].monthKey).toBe('2024-11');
    });

    it('caps a very wide span at the max window, rolling off the oldest months', () => {
      // Span 2023-01 → 2025-02 far exceeds MAX → trailing MAX months only.
      const out = buildMonthlyActivity({ '2025-02': 4, '2024-05': 2, '2023-01': 9 });
      expect(out).toHaveLength(MONTHLY_ACTIVITY_MAX_WINDOW);
      expect(out[out.length - 1].monthKey).toBe('2025-02');
      // The 2023-01 record sits before the trailing 12 → off-chart (honest gap).
      expect(monthlyActivityWindowTotal(out)).toBe(6);
      expect(out.some((e) => e.monthKey === '2023-01')).toBe(false);
    });

    it('an explicit `months` still pins a fixed trailing window (adaptive is opt-out)', () => {
      // Same wide data, but pinned to 3 → the pre-adaptive behaviour, unchanged.
      const out = buildMonthlyActivity({ '2024-11': 3, '2024-03': 2, '2024-06': 1 }, 3);
      expect(out.map((e) => e.monthKey)).toEqual(['2024-09', '2024-10', '2024-11']);
    });
  });

  it('is a pure read — does not mutate the input map', () => {
    const input = { '2024-11': 3, '2024-10': 1 };
    const snapshot = { ...input };
    buildMonthlyActivity(input, 6);
    expect(input).toEqual(snapshot);
  });
});

describe('monthlyActivityRangeLabel', () => {
  it('returns null for an empty series', () => {
    expect(monthlyActivityRangeLabel([])).toBeNull();
  });

  it('collapses the year when the window is within one calendar year', () => {
    const out = buildMonthlyActivity({ '2024-11': 1, '2024-06': 1 }, 6);
    expect(monthlyActivityRangeLabel(out)).toBe('giu – nov 2024');
  });

  it('shows both years when the window spans a year boundary', () => {
    const out = buildMonthlyActivity({ '2025-01': 1 }, 4);
    expect(monthlyActivityRangeLabel(out)).toBe('ott 2024 – gen 2025');
  });
});

describe('monthlyActivityWindowTotal', () => {
  it('is 0 for an empty series', () => {
    expect(monthlyActivityWindowTotal([])).toBe(0);
  });

  it('sums every bar in the window, ignoring off-window months', () => {
    // Latest is 2024-11; the 2024-04 count (3) sits outside the trailing 6.
    const out = buildMonthlyActivity({ '2024-11': 2, '2024-08': 1, '2024-04': 3 }, 6);
    expect(monthlyActivityWindowTotal(out)).toBe(3);
  });

  it('counts zero-filled gap months as zero', () => {
    const out = buildMonthlyActivity({ '2024-11': 4, '2024-09': 1 }, 6);
    expect(monthlyActivityWindowTotal(out)).toBe(5);
  });
});
