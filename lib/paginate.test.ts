import { describe, it, expect, vi } from 'vitest';
import { walkPages, recentYears, fullScanYears, MAX_OFFSET, type Page } from './paginate';

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
