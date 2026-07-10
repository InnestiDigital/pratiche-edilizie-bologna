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
import { RELEASED_STATUSES, type FilingType } from './constants';
import { CATEGORY_HAS_RELEASE_TIME, type Category } from './sources';
import type { FeedFilters } from './build-feed-query';
import type { ProcessingDatePair } from './processing-stats';
import { getCoords } from './permit-extra';
import { streetDisplayName } from './home-address';
import type { StreetEntry } from './street-index';
import {
  rankNearby,
  NEARBY_DEFAULT_RADIUS_M,
  NEARBY_LIMIT,
  type NearbyResult,
} from './nearby-permits';
import {
  PERMIT_FIXTURES,
  STATS_FIXTURE,
  FAVORITE_SOURCE_IDS,
  NOTE_FIXTURES,
} from './screenshot-fixtures';

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
  category: Category;
  source_updated_at: string | null;
  first_seen_at: string;
  address: string | null;
  zone: string | null;
  codvia: number | null;
  procedimento: string | null;
  date_issued: string | null;
  status: string;
  status_raw: string;
  /** The status this permit held before its most recent flip; NULL if it never
   *  transitioned. Drives the "cosa è cambiato" line via `statusChangeLine`. */
  previous_status: string | null;
  /** ISO instant `previous_status` was captured; NULL alongside it. */
  status_changed_at: string | null;
  tags: string;
  source_link: string | null;
  is_new: number;
  /** Card headline for non-edilizia sources; NULL for edilizia (heads with address). */
  title: string | null;
  /** Category-specific fields as a JSON object string; decoded via `permit-extra.ts`. */
  extra: string;
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
    // The filing-type chips (PDC/SCIA/CILA) are edilizia-only sub-filters. Mirror
    // build-feed-query's edilizia-scoped IN (`category <> 'edilizia' OR filing_type
    // IN (...)`) so a cantiere/event/… row is kept regardless of its filing_type
    // token — else the default "Tutte" feed (prefs seed all 3 edilizia types) drops
    // every non-edilizia row and the fixture feed shows ONLY edilizia, never the
    // other 4 categories.
    rows = rows.filter(
      (p) => p.category !== 'edilizia' || filters.filingTypes.includes(p.filing_type)
    );
  if (filters.categories?.length)
    rows = rows.filter((p) => filters.categories!.includes(p.category));
  if (filters.statuses?.length) rows = rows.filter((p) => filters.statuses!.includes(p.status));
  if (filters.onlyNew) rows = rows.filter((p) => p.is_new === 1);
  if (filters.onlyFavorites) rows = rows.filter((p) => FAVORITE_SOURCE_IDS.has(p.source_id));
  if (filters.onlyNoted) rows = rows.filter((p) => p.source_id in NOTE_FIXTURES);
  if (filters.requestedAfter)
    // Mirrors build-feed-query's REQUEST_DATE_SQL: eventi carry NULL
    // source_updated_at and are compared by discovery date instead.
    rows = rows.filter((p) => {
      const requestDate = p.category === 'eventi' ? p.first_seen_at : p.source_updated_at;
      return requestDate !== null && requestDate >= filters.requestedAfter!;
    });
  if (filters.searchQuery?.trim()) {
    const q = filters.searchQuery.trim().toLowerCase();
    rows = rows.filter(
      (p) =>
        (p.address ?? '').toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q)
    );
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

export async function getRelatedPermits(
  _db: SQLite.SQLiteDatabase,
  zone: string | null,
  excludeId: number,
  limit = 3
): Promise<Permit[]> {
  if (!zone) return [];
  const recency = (p: Permit) => p.date_issued ?? p.source_updated_at ?? p.first_seen_at ?? '';
  return FIXTURES.filter((p) => p.zone === zone && p.id !== excludeId)
    .sort((a, b) => (recency(a) < recency(b) ? 1 : recency(a) > recency(b) ? -1 : 0))
    .slice(0, limit);
}

export async function getNearbyPermits(
  _db: SQLite.SQLiteDatabase,
  permit: Permit,
  radiusMeters: number = NEARBY_DEFAULT_RADIUS_M,
  limit: number = NEARBY_LIMIT
): Promise<NearbyResult<Permit>[]> {
  const origin = getCoords(permit.extra);
  if (!origin) return [];
  return rankNearby(
    origin,
    permit.id,
    FIXTURES,
    (p) => p.id,
    (p) => getCoords(p.extra),
    radiusMeters,
    limit
  );
}

export async function getStats(_db: SQLite.SQLiteDatabase): Promise<{
  total: number;
  byDataset: Record<string, number>;
  byZone: Record<string, number>;
  byStatus: Record<string, number>;
  byMonth: Record<string, number>;
  byTag: Record<string, number>;
  newCount: number;
}> {
  return STATS_FIXTURE;
}

export async function getReleasedDatePairs(
  _db: SQLite.SQLiteDatabase
): Promise<ProcessingDatePair[]> {
  const released: readonly string[] = RELEASED_STATUSES;
  return FIXTURES.filter(
    (p) =>
      released.includes(p.status) &&
      CATEGORY_HAS_RELEASE_TIME[p.category] &&
      p.date_issued !== null &&
      p.source_updated_at !== null
  ).map((p) => ({ request: p.source_updated_at, closing: p.date_issued }));
}

export async function countNewPermits(_db: SQLite.SQLiteDatabase): Promise<number> {
  return FIXTURES.filter((p) => p.is_new === 1).length;
}

export async function markAllSeen(_db: SQLite.SQLiteDatabase): Promise<void> {
  // no-op on web
}

// Candidate rows for the "Novità" activity feed (new arrivals + persisted status
// transitions). Order is unimportant here — `buildActivityFeed` re-sorts — so the
// shim just filters the fixtures. `previous_status` is optional on the fixture
// shape, so `!= null` also excludes the `undefined` rows.
// `_ackAt` (the acknowledgement watermark) is ignored on web: the fixture
// render must always show activity, regardless of any watermark.
export async function getActivityPermits(
  _db: SQLite.SQLiteDatabase,
  _ackAt: string | null,
  limit = 100
): Promise<Permit[]> {
  return FIXTURES.filter((p) => p.is_new === 1 || p.previous_status != null).slice(0, limit);
}

export async function countActivityPermits(
  _db: SQLite.SQLiteDatabase,
  _ackAt: string | null
): Promise<number> {
  return FIXTURES.filter((p) => p.is_new === 1 || p.previous_status != null).length;
}

export async function markPermitSeen(_db: SQLite.SQLiteDatabase, _id: number): Promise<void> {
  // no-op in the screenshot build
}

export async function getNewSourceIds(_db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  return new Set(FIXTURES.filter((p) => p.is_new === 1).map((p) => p.source_id));
}

export async function getEdiliziaStreets(_db: SQLite.SQLiteDatabase): Promise<StreetEntry[]> {
  return FIXTURES.filter(
    (p) => p.category === 'edilizia' && p.codvia !== null && p.address !== null
  ).map((p) => ({ via: streetDisplayName(p.address as string), codvia: p.codvia as number }));
}
