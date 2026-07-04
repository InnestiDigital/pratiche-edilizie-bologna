import type * as SQLite from 'expo-sqlite';
import type { FilingType } from './constants';
import { buildFeedQuery, buildFeedCountQuery, type FeedFilters } from './build-feed-query';
import { buildRelatedPermitsQuery, RELATED_PERMITS_LIMIT } from './related-query';

// The feed-query primitives live in the pure, db-free `build-feed-query` module
// so the SQL construction is unit-testable in isolation. Re-exported here so the
// UI + existing tests keep importing them from `./queries` unchanged.
export {
  buildFeedQuery,
  buildFeedCountQuery,
  buildFeedWhere,
  escapeLike,
  SORT_LABELS,
  type FeedFilters,
  type SortOption,
  type FeedQuery,
} from './build-feed-query';

export interface Permit {
  id: number;
  dataset: string;
  source_id: string;
  filing_type: FilingType;
  source_updated_at: string | null;
  first_seen_at: string;
  address: string | null;
  zone: string | null;
  codvia: number | null;
  procedimento: string | null;
  date_issued: string | null;
  status: string;
  status_raw: string;
  tags: string;
  source_link: string | null;
  is_new: number;
}

/**
 * Safely decode a permit's `tags` column into a string array.
 *
 * `normalize.ts` always writes this as `JSON.stringify(string[])`, but a legacy
 * row, a manual DB edit, or a future schema change could leave a malformed value.
 * The tag *filter* now runs in SQL (see buildFeedQuery), but the UI still decodes
 * this column to render each permit's tag chips; a raw `JSON.parse` there would
 * throw and blank the screen, so parse defensively: any non-array /
 * non-string-element / invalid JSON collapses to `[]` instead of crashing.
 */
export function parsePermitTags(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((t): t is string => typeof t === 'string');
}

export async function getPermits(
  db: SQLite.SQLiteDatabase,
  filters: FeedFilters,
  limit = 50,
  offset = 0
): Promise<Permit[]> {
  // The tag filter is applied in SQL (json_each on the JSON tags column), so
  // LIMIT/OFFSET operates on already-filtered rows and no matching permit is
  // skipped across pages — see buildFeedQuery. Rows are returned as-is.
  const { sql, params } = buildFeedQuery(filters, limit, offset);
  return db.getAllAsync<Permit>(sql, ...params);
}

/**
 * Count the permits matching the given feed filters, ignoring pagination.
 *
 * Shares `buildFeedCountQuery`'s WHERE with `getPermits`, so the number returned
 * is exactly how many rows the feed would list for the same filters — the value
 * behind the feed's "N pratiche" result header.
 */
export async function countPermits(
  db: SQLite.SQLiteDatabase,
  filters: FeedFilters
): Promise<number> {
  const { sql, params } = buildFeedCountQuery(filters);
  const row = await db.getFirstAsync<{ c: number }>(sql, ...params);
  return row?.c ?? 0;
}

export async function getPermitById(db: SQLite.SQLiteDatabase, id: number): Promise<Permit | null> {
  return db.getFirstAsync<Permit>('SELECT * FROM permits WHERE id = ?', id);
}

/**
 * Other permits in the same quartiere as the one being viewed, most recent
 * first, excluding the current permit — powers the detail "Nella stessa zona"
 * card. Returns `[]` when the permit has no zone (nothing to relate on).
 * SQL construction lives in the pure, tested `related-query` module.
 */
export async function getRelatedPermits(
  db: SQLite.SQLiteDatabase,
  zone: string | null,
  excludeId: number,
  limit: number = RELATED_PERMITS_LIMIT
): Promise<Permit[]> {
  if (!zone) return [];
  const { sql, params } = buildRelatedPermitsQuery(zone, excludeId, limit);
  return db.getAllAsync<Permit>(sql, ...params);
}

export async function getStats(db: SQLite.SQLiteDatabase): Promise<{
  total: number;
  byDataset: Record<string, number>;
  byZone: Record<string, number>;
  byStatus: Record<string, number>;
  byMonth: Record<string, number>;
  byTag: Record<string, number>;
  newCount: number;
}> {
  const total =
    (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM permits'))?.c ?? 0;
  const newCount =
    (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM permits WHERE is_new = 1'))
      ?.c ?? 0;

  const dsRows = await db.getAllAsync<{ dataset: string; c: number }>(
    'SELECT dataset, COUNT(*) as c FROM permits GROUP BY dataset'
  );
  const byDataset: Record<string, number> = {};
  for (const r of dsRows) byDataset[r.dataset] = r.c;

  const zoneRows = await db.getAllAsync<{ zone: string; c: number }>(
    'SELECT zone, COUNT(*) as c FROM permits WHERE zone IS NOT NULL GROUP BY zone ORDER BY c DESC'
  );
  const byZone: Record<string, number> = {};
  for (const r of zoneRows) byZone[r.zone] = r.c;

  const statusRows = await db.getAllAsync<{ status: string; c: number }>(
    'SELECT status, COUNT(*) as c FROM permits WHERE status IS NOT NULL GROUP BY status ORDER BY c DESC'
  );
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.c;

  // Permits bucketed by the month their request was filed (richiesta_data →
  // source_updated_at), keyed `YYYY-MM`. Guarded to well-formed date strings so
  // a truncated/legacy value can't produce a junk bucket; the pure
  // `buildMonthlyActivity` builds the trailing-months chart series from this.
  const monthRows = await db.getAllAsync<{ m: string; c: number }>(
    'SELECT substr(source_updated_at, 1, 7) AS m, COUNT(*) AS c FROM permits ' +
      'WHERE source_updated_at IS NOT NULL AND length(source_updated_at) >= 7 GROUP BY m'
  );
  const byMonth: Record<string, number> = {};
  for (const r of monthRows) byMonth[r.m] = r.c;

  // Permits carrying each topic tag: json_each expands the JSON `tags` array so
  // one permit contributes to every label it holds (mirrors the pure `tallyTags`
  // used by the web shim). The inner subquery gates on json_valid so a malformed
  // row can't make json_each raise "malformed JSON" — it is skipped instead.
  const tagRows = await db.getAllAsync<{ tag: string; c: number }>(
    'SELECT je.value AS tag, COUNT(*) AS c FROM ' +
      '(SELECT tags FROM permits WHERE json_valid(tags)) p, json_each(p.tags) je ' +
      "WHERE json_type(je.value) = 'text' GROUP BY je.value"
  );
  const byTag: Record<string, number> = {};
  for (const r of tagRows) byTag[r.tag] = r.c;

  return { total, byDataset, byZone, byStatus, byMonth, byTag, newCount };
}

export async function countNewPermits(db: SQLite.SQLiteDatabase): Promise<number> {
  return (
    (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM permits WHERE is_new = 1'))
      ?.c ?? 0
  );
}

export async function markAllSeen(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE permits SET is_new = 0 WHERE is_new = 1');
}
