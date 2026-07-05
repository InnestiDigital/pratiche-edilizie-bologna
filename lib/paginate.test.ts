import { describe, it, expect, vi } from 'vitest';
import {
  walkPages,
  recentYears,
  fullScanYears,
  bisectRange,
  addYearsIso,
  MAX_OFFSET,
  type Page,
} from './paginate';

/**
 * A fake paginated source: `total` rows, served `limit` at a time. Records the
 * offsets it was asked for so we can assert the walk's stepping and stopping.
 */
function fakeSource(total: number, limit: number) {
  const offsets: number[] = [];
  const rows = Array.from({ length: total }, (_, i) => i);
  const fetchPage = (offset: number): Promise<Page<number>> => {
    offsets.push(offset);
    return Promise.resolve({ results: rows.slice(offset, offset + limit) });
  };
  return { fetchPage, offsets };
}

describe('walkPages', () => {
  it('accumulates every row across pages in order', async () => {
    const { fetchPage } = fakeSource(250, 100);
    const all = await walkPages(fetchPage, 100);
    expect(all).toHaveLength(250);
    expect(all[0]).toBe(0);
    expect(all[249]).toBe(249);
  });

  it('steps the offset by limit and stops on the short final page', async () => {
    const { fetchPage, offsets } = fakeSource(250, 100);
    await walkPages(fetchPage, 100);
    // 0 (100 rows) -> 100 (100 rows) -> 200 (50 rows, short) -> stop
    expect(offsets).toEqual([0, 100, 200]);
  });

  it('stops on an empty first page (no rows)', async () => {
    const { fetchPage, offsets } = fakeSource(0, 100);
    const all = await walkPages(fetchPage, 100);
    expect(all).toEqual([]);
    expect(offsets).toEqual([0]);
  });

  it('fetches one extra empty page when total is an exact multiple of limit', async () => {
    const { fetchPage, offsets } = fakeSource(200, 100);
    const all = await walkPages(fetchPage, 100);
    expect(all).toHaveLength(200);
    // full page at 0 and 100, then 200 returns empty -> stop
    expect(offsets).toEqual([0, 100, 200]);
  });

  it('halts at MAX_OFFSET instead of paging past the ODS cap', async () => {
    // Every page is full, so only the offset cap can stop the walk.
    const fetchPage = vi.fn(
      (offset: number): Promise<Page<number>> =>
        Promise.resolve({ results: Array.from({ length: 100 }, (_, i) => offset + i) })
    );
    const all = await walkPages(fetchPage, 100);
    // Last fetched offset is 9800; after pushing it offset becomes 9900 (>= cap) -> stop.
    const lastOffset = fetchPage.mock.calls.at(-1)?.[0];
    expect(lastOffset).toBe(MAX_OFFSET - 100);
    expect(all).toHaveLength(MAX_OFFSET);
    // It never asks for offset >= MAX_OFFSET.
    expect(fetchPage.mock.calls.every(([o]) => o < MAX_OFFSET)).toBe(true);
  });

  it('rejects a non-positive or non-integer limit', async () => {
    const { fetchPage } = fakeSource(10, 5);
    await expect(walkPages(fetchPage, 0)).rejects.toBeInstanceOf(RangeError);
    await expect(walkPages(fetchPage, -1)).rejects.toBeInstanceOf(RangeError);
    await expect(walkPages(fetchPage, 2.5)).rejects.toBeInstanceOf(RangeError);
  });

  it('propagates a fetch error instead of swallowing it', async () => {
    const boom = new Error('network down');
    const fetchPage = () => Promise.reject(boom);
    await expect(walkPages(fetchPage, 100)).rejects.toBe(boom);
  });
});

describe('recentYears', () => {
  it('returns the last N years inclusive of the current year', () => {
    expect(recentYears(2026, 2)).toEqual([2025, 2026]);
    expect(recentYears(2026, 1)).toEqual([2026]);
    expect(recentYears(2026, 5)).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it('returns an empty list for a non-positive window', () => {
    expect(recentYears(2026, 0)).toEqual([]);
    expect(recentYears(2026, -3)).toEqual([]);
  });
});

describe('fullScanYears', () => {
  it('returns every year from the start through the current year inclusive', () => {
    expect(fullScanYears(2024, 2026)).toEqual([2024, 2025, 2026]);
    expect(fullScanYears(2026, 2026)).toEqual([2026]);
  });

  it('returns an empty list when the start is after the current year', () => {
    expect(fullScanYears(2027, 2026)).toEqual([]);
  });
});

describe('bisectRange', () => {
  it('splits an even-day range at the exact midpoint day, preserving half-open bounds', () => {
    // 2024-01-01 .. 2024-01-11 spans 10 days; midpoint is +5 days = 2024-01-06.
    expect(bisectRange({ from: '2024-01-01', toExclusive: '2024-01-11' })).toEqual([
      { from: '2024-01-01', toExclusive: '2024-01-06' },
      { from: '2024-01-06', toExclusive: '2024-01-11' },
    ]);
  });

  it('splits an odd-day range at floor(days / 2)', () => {
    // 2024-01-01 .. 2024-01-10 spans 9 days; floor(9/2)=4 → 2024-01-05.
    expect(bisectRange({ from: '2024-01-01', toExclusive: '2024-01-10' })).toEqual([
      { from: '2024-01-01', toExclusive: '2024-01-05' },
      { from: '2024-01-05', toExclusive: '2024-01-10' },
    ]);
  });

  it('splits a full calendar year into two contiguous halves', () => {
    // 2024 is a leap year (366 days); floor(366/2)=183 days from Jan 1 = Jul 2.
    const halves = bisectRange({ from: '2024-01-01', toExclusive: '2025-01-01' });
    expect(halves).toEqual([
      { from: '2024-01-01', toExclusive: '2024-07-02' },
      { from: '2024-07-02', toExclusive: '2025-01-01' },
    ]);
    // Contiguous: the first half ends exactly where the second begins.
    expect(halves![0].toExclusive).toBe(halves![1].from);
  });

  it('returns null for a single-day (or shorter) range that cannot split further', () => {
    expect(bisectRange({ from: '2024-02-28', toExclusive: '2024-02-29' })).toBeNull();
    expect(bisectRange({ from: '2024-02-28', toExclusive: '2024-02-28' })).toBeNull();
  });

  it('handles a leap-day boundary window', () => {
    // 2024-02-28 .. 2024-03-01 spans 2 days (Feb 29 exists); midpoint = Feb 29.
    expect(bisectRange({ from: '2024-02-28', toExclusive: '2024-03-01' })).toEqual([
      { from: '2024-02-28', toExclusive: '2024-02-29' },
      { from: '2024-02-29', toExclusive: '2024-03-01' },
    ]);
  });
});

describe('addYearsIso', () => {
  it('adds whole calendar years, keeping month and day', () => {
    expect(addYearsIso('2026-06-28', 1)).toBe('2027-06-28');
    expect(addYearsIso('2020-01-01', 5)).toBe('2025-01-01');
  });

  it('rolls a leap day (Feb 29) forward to Mar 1 of the target year', () => {
    // Pinned to setUTCFullYear semantics: 2024-02-29 + 1y → 2025-02-29 overflows
    // to 2025-03-01 (not clamped back to Feb 28).
    expect(addYearsIso('2024-02-29', 1)).toBe('2025-03-01');
  });
});
