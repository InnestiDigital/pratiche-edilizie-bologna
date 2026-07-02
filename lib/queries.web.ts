/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * Mirrors the public surface of `queries.ts` but returns deterministic fixtures
 * instead of querying SQLite (which cannot run in the web export — see
 * `db.web.ts`). The `db` argument is accepted for signature parity and ignored.
 *
 * `Permit` and `parsePermitTags` are duplicated here (rather than re-imported
 * from `./queries`, which would self-resolve to this file on web and recurse);
 * tsc guards drift where a screen reads a field this shim's `Permit` lacks.
 *
 * Native + vitest use `queries.ts` and never load this file.
 */
import type * as SQLite from 'expo-sqlite';
import type { FilingType } from './constants';
import type { FeedFilters } from './build-feed-query';
import { PERMIT_FIXTURES, STATS_FIXTURE } from './screenshot-fixtures';

// Re-export the pure, db-free query primitives from their real home (safe: the
// `build-feed-query` module imports nothing native).
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

const FIXTURES = PERMIT_FIXTURES as Permit[];

// A light client-side pass so the fixture feed still reacts to the filters the
// screenshot may exercise (zone / filing type / search / onlyNew); enough to
// look real, not a faithful reimplementation of the SQL builder. Shared by
// getPermits and countPermits so the fixture feed and its count agree.
function filterFixtures(filters: FeedFilters): Permit[] {
  let rows = FIXTURES;
  if (filters.zones?.length)
    rows = rows.filter((p) => p.zone !== null && filters.zones.includes(p.zone as never));
  if (filters.filingTypes?.length)
    rows = rows.filter((p) => filters.filingTypes.includes(p.filing_type));
  if (filters.statuses?.length) rows = rows.filter((p) => filters.statuses!.includes(p.status));
  if (filters.onlyNew) rows = rows.filter((p) => p.is_new === 1);
  if (filters.searchQuery?.trim()) {
    const q = filters.searchQuery.trim().toLowerCase();
    rows = rows.filter((p) => (p.address ?? '').toLowerCase().includes(q));
  }
  return rows;
}

export async function getPermits(
  _db: SQLite.SQLiteDatabase,
  filters: FeedFilters,
  limit = 50,
  offset = 0
): Promise<Permit[]> {
  return filterFixtures(filters).slice(offset, offset + limit);
}

export async function countPermits(
  _db: SQLite.SQLiteDatabase,
  filters: FeedFilters
): Promise<number> {
  return filterFixtures(filters).length;
}

export async function getPermitById(
  _db: SQLite.SQLiteDatabase,
  id: number
): Promise<Permit | null> {
  return FIXTURES.find((p) => p.id === id) ?? null;
}

export async function getStats(_db: SQLite.SQLiteDatabase): Promise<{
  total: number;
  byDataset: Record<string, number>;
  byZone: Record<string, number>;
  newCount: number;
}> {
  return STATS_FIXTURE;
}

export async function countNewPermits(_db: SQLite.SQLiteDatabase): Promise<number> {
  return FIXTURES.filter((p) => p.is_new === 1).length;
}

export async function markAllSeen(_db: SQLite.SQLiteDatabase): Promise<void> {
  // no-op on web
}
