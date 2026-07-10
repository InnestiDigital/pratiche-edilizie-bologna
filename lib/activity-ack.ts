/**
 * Pure core for the "Novità" activity acknowledgement watermark.
 *
 * Novità used to count/list every voce that EVER carried an `is_new` flag or a
 * `previous_status` transition, forever — nothing ever cleared it, so the amber
 * "N aggiornamenti" badge only grew. The fix is a single preferences timestamp
 * (`activity_seen_at`, see `preferences.ts`): Novità only surfaces activity
 * NEWER than that watermark, and visiting /novita stamps it to now
 * (auto-clear-on-visit). This module is the data-only leaf both the read-side
 * predicate and its SQL twin (`queries.ts`) are built from.
 */

/**
 * When did this permit's activity happen? A transition's instant is when its
 * status changed; an arrival's instant is when it was first seen. This is the
 * single source of truth for "activity instant" — it MIRRORS the SQL
 * `COALESCE(status_changed_at, first_seen_at)` used in `queries.ts` (both the
 * activity WHERE filter and its ORDER BY), so the two can never drift.
 */
export function activityInstant(p: {
  status_changed_at: string | null;
  first_seen_at: string;
}): string {
  return p.status_changed_at ?? p.first_seen_at;
}

/**
 * Is this activity entry still "unread" in Novità, given the acknowledgement
 * watermark (the `activity_seen_at` preference)?
 *
 * - `seenAt` null or empty ('') → true: never acknowledged, everything is unread.
 * - `instant` null/undefined/empty → true: fail OPEN on malformed data — never
 *   silently hide activity because a timestamp is missing/corrupt.
 * - Otherwise strictly greater-than: `instant > seenAt`. All timestamps in this
 *   app are `new Date().toISOString()` (UTC, same fixed-width format), so plain
 *   lexicographic string comparison is a valid instant comparison here. An entry
 *   stamped exactly AT the watermark is considered already acknowledged (false).
 */
export function isUnacknowledgedActivity(
  instant: string | null | undefined,
  seenAt: string | null
): boolean {
  if (!seenAt) return true;
  if (!instant) return true;
  return instant > seenAt;
}
