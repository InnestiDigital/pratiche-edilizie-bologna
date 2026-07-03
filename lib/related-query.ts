/**
 * Pure SQL builder for the permit-detail "Nella stessa zona" card — the small
 * list of other permits in the same quartiere shown at the bottom of a permit's
 * detail, so a resident browsing one record can hop to nearby filings without
 * going back to the feed and re-filtering.
 *
 * Kept db-free (no `expo-sqlite`, no native imports) so the WHERE/ORDER/LIMIT
 * construction is unit-tested in Node, mirroring `build-feed-query.ts`. The
 * caller (`getRelatedPermits` in `queries.ts`) runs the returned SQL.
 */

export interface RelatedPermitsQuery {
  sql: string;
  params: (string | number)[];
}

/** Default number of nearby permits shown on the detail card. */
export const RELATED_PERMITS_LIMIT = 3;

/**
 * Build the query for up to `limit` other permits in `zone`, excluding the
 * permit with `excludeId`, most recent first.
 *
 * Recency uses `COALESCE(date_issued, source_updated_at, first_seen_at)` so a
 * permit still sorts sanely when its closing date is missing (falls back to the
 * request date, then to when the app first saw it) — the same date precedence
 * the detail timeline uses. `limit` is clamped to a positive integer so a
 * malformed caller value can never emit `LIMIT 0` or a fractional/negative bound.
 */
export function buildRelatedPermitsQuery(
  zone: string,
  excludeId: number,
  limit: number = RELATED_PERMITS_LIMIT
): RelatedPermitsQuery {
  const safeLimit =
    Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : RELATED_PERMITS_LIMIT;
  return {
    sql:
      'SELECT * FROM permits WHERE zone = ? AND id != ? ' +
      'ORDER BY COALESCE(date_issued, source_updated_at, first_seen_at) DESC LIMIT ?',
    params: [zone, excludeId, safeLimit],
  };
}
