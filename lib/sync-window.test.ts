import { describe, it, expect } from 'vitest';
import {
  computeSyncWindow,
  SYNC_OVERLAP_DAYS,
  SYNC_MAX_GAP_DAYS,
  type SyncWindow,
} from './sync-window';

// All instants are built as absolute UTC (`…Z`) so the gap math and the UTC-floored
// `since` are timezone-independent regardless of where the test runner runs.
const utc = (iso: string) => new Date(iso);

describe('computeSyncWindow', () => {
  it('cold start (null / empty / whitespace marker) → fallback', () => {
    const now = utc('2026-07-17T10:00:00Z');
    for (const marker of [null, undefined, '', '   ']) {
      expect(computeSyncWindow(marker, now, 30, 730)).toEqual<SyncWindow>({
        kind: 'fallback',
        reason: 'cold-start',
      });
    }
  });

  it('normal recent sync → incremental since = marker − overlap (UTC day)', () => {
    // Synced 5 days ago; 30-day overlap re-covers late-published near-boundary rows.
    const win = computeSyncWindow('2026-07-12T08:30:00Z', utc('2026-07-17T10:00:00Z'), 30, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'incremental', since: '2026-06-12' });
  });

  it('zero overlap → since is the marker calendar day itself', () => {
    const win = computeSyncWindow('2026-07-12T23:59:00Z', utc('2026-07-13T00:10:00Z'), 0, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'incremental', since: '2026-07-12' });
  });

  it('overlap rolling back across a month AND year boundary', () => {
    // 2026-01-03 − 7 days → 2025-12-27 (crosses both the month and the year).
    const win = computeSyncWindow('2026-01-03T02:00:00Z', utc('2026-01-05T02:00:00Z'), 7, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'incremental', since: '2025-12-27' });
  });

  it('stale gap over the threshold → fallback (fixed window is no more expensive)', () => {
    // ~2.7 years old, past the 730-day ceiling.
    const win = computeSyncWindow('2023-11-01T00:00:00Z', utc('2026-07-17T00:00:00Z'), 30, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'fallback', reason: 'stale-gap' });
  });

  it('gap exactly at the threshold stays incremental (boundary is inclusive)', () => {
    // now − 730 whole days: gap === maxGapDays, `> maxGapDays` is false → incremental.
    const now = utc('2026-07-17T00:00:00Z');
    const marker = new Date(now.getTime() - 730 * 86_400_000).toISOString();
    const win = computeSyncWindow(marker, now, 30, 730);
    expect(win.kind).toBe('incremental');
  });

  it('future / clock-skewed marker → fallback (never trust it to bound a window)', () => {
    // Marker one day ahead of `now`.
    const win = computeSyncWindow('2026-07-18T10:00:00Z', utc('2026-07-17T10:00:00Z'), 30, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'fallback', reason: 'future-marker' });
  });

  it('unparseable marker → fallback (corrupt sync_log, not a cold start)', () => {
    const win = computeSyncWindow('not-a-date', utc('2026-07-17T10:00:00Z'), 30, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'fallback', reason: 'unparseable-marker' });
  });

  it('a marker at the same instant as now → incremental (gap 0, non-negative)', () => {
    const win = computeSyncWindow('2026-07-17T10:00:00Z', utc('2026-07-17T10:00:00Z'), 30, 730);
    expect(win).toEqual<SyncWindow>({ kind: 'incremental', since: '2026-06-17' });
  });

  it('rejects a non-integer / negative overlapDays or maxGapDays', () => {
    const now = utc('2026-07-17T10:00:00Z');
    const marker = '2026-07-12T08:30:00Z';
    expect(() => computeSyncWindow(marker, now, -1, 730)).toThrow(RangeError);
    expect(() => computeSyncWindow(marker, now, 1.5, 730)).toThrow(RangeError);
    expect(() => computeSyncWindow(marker, now, 30, -5)).toThrow(RangeError);
    expect(() => computeSyncWindow(marker, now, 30, Number.NaN)).toThrow(RangeError);
  });

  it('exposes sane defaults (overlap 30d, max-gap 730d ≈ the fixed 2y recent window)', () => {
    expect(SYNC_OVERLAP_DAYS).toBe(30);
    expect(SYNC_MAX_GAP_DAYS).toBe(730);
    // Defaulted call: 3-day-old marker → incremental with the 30-day default overlap.
    const win = computeSyncWindow('2026-07-14T00:00:00Z', utc('2026-07-17T00:00:00Z'));
    expect(win).toEqual<SyncWindow>({ kind: 'incremental', since: '2026-06-14' });
  });
});
