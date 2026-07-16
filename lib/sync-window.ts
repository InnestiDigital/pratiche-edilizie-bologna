/**
 * Pure decision core for **incremental sync**: given the last successful sync of a
 * source, compute the window the next *recent* sync should walk — a cheap
 * open-ended `since` window when a recent prior sync exists, or the existing fixed
 * recent-2y / future-window **fallback** on a cold start or a very stale gap.
 *
 * WHY this exists (ROADMAP §3's named post-P2 residual). The `date-range` sources
 * (commercio, segnalazioni) re-walk a fixed `recentYears(now, 2)` window on EVERY
 * sync — ~400 sequential paged requests. In the foreground that is merely slow;
 * in the iOS background task it blows the ~30s budget, so the run is killed before
 * it can summarize/notify and the app's core "cosa cambia intorno a te" auto-alert
 * silently never fires. Keying the recent background pass off the last sync shrinks
 * each run to just-what-changed, so the unattended notification finally works.
 *
 * ── PROBE-FIRST no-invented-data note (live ODS check, 2026-07-17) ──────────────
 * Neither `istanze-commercio` nor `segnalazioni-…-czrm` exposes a per-record
 * monotonic ingestion/modification timestamp: the default records payload carries
 * only the SOURCE domain date (commercio `data_richiesta` — a plain `YYYY-MM-DD`;
 * segnalazioni `data_inserimento` — an ISO datetime), and the only meta timestamp
 * (`metas.default.modified`) is a single DATASET-wide instant, useless for a
 * per-record window. So the incremental `since` is keyed on the DOMAIN date field
 * the sweep already filters (via {@link import('./ods-request').buildSinceWhere}),
 * NOT on ingest time.
 *
 * CAVEAT that keys the design: the marker fed in here is the sync WALL-CLOCK time
 * (`sync_log.synced_at`), but the sweep filters the domain date — so a record
 * *published/backdated* into ODS with a domain date earlier than `since` is missed
 * by an incremental pass. Two things bound that: (1) a generous `overlapDays`
 * lookback re-covers the boundary + near-boundary late-published rows, and (2)
 * **`syncFull` stays the completeness backstop** — incremental is only a cheap
 * freshness pass for the recent/background path, never a replacement.
 *
 * Kept free of expo/react-native, SQLite and clock access: the caller injects the
 * marker (a `sync_log` SELECT) and `now`, so the mapping is deterministic and
 * unit-testable — mirroring the rest of `lib/`. The DB-coupled glue (reading the
 * per-source marker, threading `since` into the recent date-range sweep) is a
 * separate device-gated slice; this module is the pure window computation only.
 */

const DAY_MS = 86_400_000;

/**
 * Default safety-overlap (days) subtracted from the sync marker to form `since`.
 * Generous on purpose: the marker is ingest wall-clock but the filter is the
 * domain date (see the module note), so a month of lookback re-covers filings
 * whose domain date lags their publication — the common late-entry case — without
 * approaching the cost of the fixed 2-year window.
 */
export const SYNC_OVERLAP_DAYS = 30;

/**
 * Default max staleness (days) before the incremental window is abandoned for the
 * fixed fallback. Set to the fixed recent window's span (`recentYears(now, 2)` ≈
 * 730 days): once the gap approaches two years, an incremental `since` reaches
 * back as far as the fixed recent scan would anyway, so it buys nothing and the
 * established completeness path is preferred.
 */
export const SYNC_MAX_GAP_DAYS = 730;

/** Why a run fell back to the fixed window (surfaced for the caller's telemetry). */
export type SyncWindowFallbackReason =
  | 'cold-start' // no prior successful sync marker for this source
  | 'unparseable-marker' // marker present but not a valid instant (corrupt sync_log)
  | 'future-marker' // marker is after `now` (clock skew) — untrusted
  | 'stale-gap'; // last sync older than the max-gap threshold

/**
 * The window the next *recent* sync of a source should walk.
 * - `incremental`: an open-ended `<field> >= since` freshness pass.
 * - `fallback`: use the source's existing fixed recent window (recent-2y /
 *   future-window) — the caller's current behaviour, unchanged.
 */
export type SyncWindow =
  | { readonly kind: 'incremental'; readonly since: string } // `since` is `YYYY-MM-DD`
  | { readonly kind: 'fallback'; readonly reason: SyncWindowFallbackReason };

function requireNonNegativeInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

function fallback(reason: SyncWindowFallbackReason): SyncWindow {
  return { kind: 'fallback', reason };
}

/**
 * Decide the incremental window for a source's next *recent* sync.
 *
 * @param lastSyncMarker the source's last successful `sync_log.synced_at` (an ISO
 *   instant), or `null`/empty when it has never synced.
 * @param now injected reference clock (a real `new Date()` at call time).
 * @param overlapDays whole-day lookback subtracted from the marker to form `since`
 *   (defaults to {@link SYNC_OVERLAP_DAYS}).
 * @param maxGapDays staleness ceiling: a gap beyond this falls back (defaults to
 *   {@link SYNC_MAX_GAP_DAYS}).
 * @returns an `incremental` window with a `YYYY-MM-DD` `since`, or a `fallback`
 *   with the reason (cold start / unparseable / future marker / too stale).
 * @throws {RangeError} when `overlapDays`/`maxGapDays` is not a non-negative integer.
 */
export function computeSyncWindow(
  lastSyncMarker: string | null | undefined,
  now: Date,
  overlapDays: number = SYNC_OVERLAP_DAYS,
  maxGapDays: number = SYNC_MAX_GAP_DAYS
): SyncWindow {
  requireNonNegativeInt('overlapDays', overlapDays);
  requireNonNegativeInt('maxGapDays', maxGapDays);

  if (lastSyncMarker == null) return fallback('cold-start');
  const trimmed = lastSyncMarker.trim();
  if (trimmed === '') return fallback('cold-start');

  const markerMs = new Date(trimmed).getTime();
  if (Number.isNaN(markerMs)) return fallback('unparseable-marker');

  const gapMs = now.getTime() - markerMs;
  // A marker after `now` means clock skew / a bogus future stamp — never trust it
  // to bound a window (it would produce a future `since` that fetches nothing).
  if (gapMs < 0) return fallback('future-marker');
  // Too stale: an incremental `since` would reach back as far as the fixed recent
  // window anyway (see SYNC_MAX_GAP_DAYS) — no saving, so use the completeness path.
  if (gapMs / DAY_MS > maxGapDays) return fallback('stale-gap');

  // `since` = marker − overlap, floored to a UTC calendar day (the `YYYY-MM-DD`
  // form `buildSinceWhere` embeds). UTC-safe like `paginate.addYearsIso`; the
  // subtraction rolls back over month/year boundaries correctly.
  const since = new Date(markerMs - overlapDays * DAY_MS).toISOString().slice(0, 10);
  return { kind: 'incremental', since };
}
