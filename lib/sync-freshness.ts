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

/** Data at least this many days old is flagged stale (a resync is nudged). */
export const SYNC_STALE_DAYS = 30;

export interface SyncFreshness {
  /** Human Italian relative label, e.g. "oggi", "ieri", "3 giorni fa", "2 mesi fa". */
  label: string;
  /** Whole days between the sync and `now` (0 for a future/skewed stamp). */
  days: number;
  /** True once the snapshot is at least `SYNC_STALE_DAYS` old. */
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

  return {
    label: relativeLabel(days),
    days,
    stale: days >= SYNC_STALE_DAYS,
  };
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
