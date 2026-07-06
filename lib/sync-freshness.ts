/**
 * Pure helper turning the "last sync" ISO timestamp into a human, at-a-glance
 * freshness label for the Sync screen (Italian), plus a staleness flag that nudges
 * the user to resync once the offline snapshot has gone old.
 *
 * The app works fully offline off a *local* snapshot of the Bologna open data, so
 * the single most useful cue on the Sync screen is **how old that snapshot is** — a
 * bare "4 gennaio 2025, 10:12" makes the reader do the arithmetic. This maps the
 * timestamp to "oggi" / "ieri" / "3 giorni fa" / "2 mesi fa" and, past a threshold,
 * marks the data stale so the UI can flag it and prompt a refresh.
 *
 * Kept free of expo/react-native and clock access: the screen injects the reference
 * `now` (a real `new Date()` at call time), so the mapping is deterministic and
 * unit-testable — mirroring the rest of `lib/`. `iso` is the real ISO timestamp
 * written at sync time (`sync_log`), an absolute instant, so the elapsed-time diff
 * is timezone-independent.
 */

/** Data newer than this many days reads as fresh (a reassuring "you're current" cue). */
export const SYNC_FRESH_DAYS = 7;
/** Data at least this many days old is flagged stale (a resync is nudged). */
export const SYNC_STALE_DAYS = 30;

/**
 * Semantic freshness tier driving the Sync-screen tone. Three levels instead of a
 * flat stale/not-stale so a just-synced snapshot gets a positive signal and a
 * mid-range one stays neutral — only genuinely old data raises the amber alarm.
 * - `fresh`  (< SYNC_FRESH_DAYS): reassuring, "your data is current"
 * - `recent` (SYNC_FRESH_DAYS…SYNC_STALE_DAYS): neutral, informational
 * - `stale`  (>= SYNC_STALE_DAYS): amber warning + resync nudge
 */
export type SyncFreshnessTier = 'fresh' | 'recent' | 'stale';

export interface SyncFreshness {
  /** Human Italian relative label, e.g. "oggi", "ieri", "3 giorni fa", "2 mesi fa". */
  label: string;
  /** Whole days between the sync and `now` (0 for a future/skewed stamp). */
  days: number;
  /** Semantic tier the UI maps to a tone (green / neutral / amber). */
  tier: SyncFreshnessTier;
  /** Convenience alias for `tier === 'stale'` (kept for existing callers). */
  stale: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Map a last-sync ISO timestamp to a freshness label + staleness flag relative to
 * `now`, or `null` when there is nothing usable to show.
 *
 * - `null` / empty / whitespace-only / unparseable → `null` (caller renders nothing)
 * - a future or clock-skewed stamp → `days` clamped to 0 → "oggi", never stale
 */
export function syncFreshness(iso: string | null | undefined, now: Date): SyncFreshness | null {
  if (iso == null) return null;
  const trimmed = iso.trim();
  if (trimmed === '') return null;

  const then = new Date(trimmed).getTime();
  if (Number.isNaN(then)) return null;

  // Floor to whole days; clamp a negative diff (future stamp / clock skew) to 0.
  const days = Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY));
  const tier = freshnessTier(days);

  return {
    label: relativeLabel(days),
    days,
    tier,
    stale: tier === 'stale',
  };
}

/** Whole-day count → semantic freshness tier (thresholds at FRESH/STALE days). */
function freshnessTier(days: number): SyncFreshnessTier {
  if (days < SYNC_FRESH_DAYS) return 'fresh';
  if (days < SYNC_STALE_DAYS) return 'recent';
  return 'stale';
}

/** Whole-day count → Italian relative label with correct singular/plural agreement. */
function relativeLabel(days: number): string {
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 settimana fa' : `${weeks} settimane fa`;
  }
  if (days < 365) {
    // Cap at 11 so the label never reads "12 mesi fa" the day before a year.
    const months = Math.min(11, Math.floor(days / 30));
    return months === 1 ? '1 mese fa' : `${months} mesi fa`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 anno fa' : `${years} anni fa`;
}
