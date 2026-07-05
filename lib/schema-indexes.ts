/**
 * Single source of truth for the `permits` table's secondary indexes.
 *
 * The feed (`app/(tabs)/index.tsx` → `queries.getPermits` → `buildFeedQuery`) runs
 * `SELECT * FROM permits [WHERE ...] ORDER BY <col> [DESC|ASC], id [DESC|ASC] LIMIT ? OFFSET ?`
 * repeatedly for infinite scroll. Without an index on the ORDER BY column, SQLite
 * must sort the *entire* matching set on every page — O(n log n) per page — which on
 * a full-scan install (tens of thousands of permits across ~25 years × 3 datasets)
 * is a real jank source on a low-end device.
 *
 * Keeping the index set as pure data (rather than only inline DDL in `db.ts`) lets a
 * unit test assert the perf contract — every feed sort/filter column stays indexed —
 * without a native SQLite engine. `db.ts` builds its `CREATE INDEX` statements from
 * this list.
 *
 * ## Why single-column indexes serve the composite `ORDER BY <col>, id`
 *
 * `permits.id` is `INTEGER PRIMARY KEY AUTOINCREMENT`, i.e. an alias for SQLite's
 * `rowid`. Every entry of a non-covering index is `(indexed-column…, rowid)`, so an
 * index on just `first_seen_at` is physically ordered by `(first_seen_at, id)` — which
 * is exactly the feed's total-order tiebreaker (`first_seen_at DESC, id DESC`, walkable
 * in reverse). So a plain single-column index on each sort column serves the composite
 * ORDER BY as an index-only ordered scan; no explicit `(col, id)` composite is needed.
 */

/** A secondary index on the `permits` table: its name and the column it covers. */
export interface PermitIndexSpec {
  /** Index name — must be unique across the schema. */
  name: string;
  /** The single `permits` column the index covers. */
  column: string;
}

/**
 * Every secondary index created on `permits`. One per feed sort column and per
 * high-selectivity filter column. Order is not significant.
 */
export const PERMIT_INDEX_SPECS: readonly PermitIndexSpec[] = [
  // Filter columns (WHERE `zone IN (...)` / `filing_type IN (...)` / `category IN (...)`).
  { name: 'idx_permits_zone', column: 'zone' },
  { name: 'idx_permits_filing_type', column: 'filing_type' },
  { name: 'idx_permits_category', column: 'category' },
  // Sort columns — each backs one feed SortOption's ORDER BY (see build-feed-query
  // SORT_SQL): `newest`/`oldest` → first_seen_at, `request_*` → source_updated_at,
  // `closing_newest` → date_issued.
  { name: 'idx_permits_first_seen', column: 'first_seen_at' },
  { name: 'idx_permits_source_updated_at', column: 'source_updated_at' },
  { name: 'idx_permits_date_issued', column: 'date_issued' },
];

/**
 * The `CREATE INDEX IF NOT EXISTS` statements for every spec, newline-joined.
 * Idempotent — safe to run on every `getDb()`; an existing install gains a new
 * index once and no-ops thereafter.
 */
export function createPermitIndexesSql(): string {
  return PERMIT_INDEX_SPECS.map(
    (idx) => `CREATE INDEX IF NOT EXISTS ${idx.name} ON permits(${idx.column});`
  ).join('\n');
}
