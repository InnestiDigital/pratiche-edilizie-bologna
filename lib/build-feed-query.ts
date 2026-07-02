import type { FilingType, Quartiere } from './constants';

/**
 * Pure builder for the permit-feed SQL query.
 *
 * Kept free of any expo/react-native (db) import so the brittle part of the feed
 * — dynamic WHERE/IN construction, `LIKE` escaping, sort mapping, pagination and
 * strict parameter ordering — is a single pure function that can be unit-tested
 * against its exact `{ sql, params }` output without a native SQLite engine.
 * `queries.getPermits` is a thin wrapper: build → run.
 *
 * The tag filter IS part of this SQL. Tags are stored as a JSON array string, so
 * an active tag filter matches with the SQLite JSON1 `json_each` table-valued
 * function inside a correlated `EXISTS`, guarded by `json_valid` (a corrupt/legacy
 * tags value fails the guard and is simply excluded, never erroring the query).
 * Keeping the filter in SQL — rather than post-filtering the page in JS after
 * `LIMIT/OFFSET` — is what makes `LIMIT`/`OFFSET` and the feed's "got a full page?"
 * pagination check correct when a tag filter is active.
 */

export type SortOption =
  | 'newest'
  | 'oldest'
  | 'request_newest'
  | 'request_oldest'
  | 'closing_newest';

export const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Rilevamento (recenti)',
  oldest: 'Rilevamento (meno recenti)',
  request_newest: 'Data richiesta (recenti)',
  request_oldest: 'Data richiesta (meno recenti)',
  closing_newest: 'Data chiusura (recenti)',
};

// Every sort ends in the unique `id` PK as a tiebreaker so the ORDER BY is a
// TOTAL order. The primary columns are all non-unique: a whole sync batch stamps
// hundreds of rows with the same `first_seen_at` (it is `new Date().toISOString()`
// set per-permit inside a tight insert loop), and `source_updated_at` / `date_issued`
// are the request / closing dates that many permits legitimately share (and can be
// NULL). Without a unique tiebreaker SQLite's order among tied rows is undefined and
// NOT guaranteed stable across the separate LIMIT/OFFSET queries the feed's infinite
// scroll issues per page — so tied rows could be duplicated on one page and skipped on
// the next. The `id` suffix (UNIQUE, NOT NULL, monotonic with insertion) removes the
// ties, matching the primary column's direction for an intuitive within-tie order.
const SORT_SQL: Record<SortOption, string> = {
  newest: 'first_seen_at DESC, id DESC',
  oldest: 'first_seen_at ASC, id ASC',
  request_newest: 'source_updated_at DESC, id DESC',
  request_oldest: 'source_updated_at ASC, id ASC',
  closing_newest: 'date_issued DESC, id DESC',
};

export interface FeedFilters {
  zones: Quartiere[];
  filingTypes: FilingType[];
  tags: string[];
  searchQuery?: string;
  statuses?: string[];
  onlyNew?: boolean;
  sort?: SortOption;
}

/**
 * Escape a user search term for safe use inside a SQL `LIKE` pattern.
 *
 * The feed search wraps the term as `%term%`, so the SQLite `LIKE` wildcards
 * `%` (any run) and `_` (any single char) — plus the escape char `\` itself —
 * would otherwise be interpreted, not matched literally. A search for `100%`
 * or `via_` should match those exact strings, not "100 followed by anything".
 * Callers must pair the escaped term with an `ESCAPE '\'` clause on the `LIKE`.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** The SQL text plus its ordered bind parameters for a feed query. */
export interface FeedQuery {
  sql: string;
  params: (string | number)[];
}

/**
 * Build the shared `WHERE` fragment (and its ordered bind params) for the feed
 * filters. Every dynamic fragment appends its placeholders and pushes the
 * matching params in the same order, so the returned `params` array lines up
 * positionally with the `?`s in `where`. Emits an empty `where` string when no
 * filter is active.
 *
 * This is the single source of truth for the feed predicate: both the paginated
 * row query (`buildFeedQuery`) and the total-count query (`buildFeedCountQuery`)
 * build on it, so the count is guaranteed to describe the exact rows the feed
 * lists — same filters, same param order.
 */
export function buildFeedWhere(filters: FeedFilters): {
  where: string;
  params: (string | number)[];
} {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.zones.length > 0) {
    conditions.push(`zone IN (${filters.zones.map(() => '?').join(',')})`);
    params.push(...filters.zones);
  }

  if (filters.filingTypes.length > 0) {
    conditions.push(`filing_type IN (${filters.filingTypes.map(() => '?').join(',')})`);
    params.push(...filters.filingTypes);
  }

  if (filters.searchQuery) {
    conditions.push("(address LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\')");
    const q = `%${escapeLike(filters.searchQuery)}%`;
    params.push(q, q);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`status IN (${filters.statuses.map(() => '?').join(',')})`);
    params.push(...filters.statuses);
  }

  if (filters.onlyNew) {
    conditions.push('is_new = 1');
  }

  if (filters.tags.length > 0) {
    // OR semantics: keep a permit if ANY requested tag is in its JSON tags array.
    // `json_valid` guards `json_each` against a corrupt/legacy tags value, which
    // would otherwise raise a "malformed JSON" error and fail the whole query;
    // an invalid row fails the guard and is excluded (it can't match a tag).
    const placeholders = filters.tags.map(() => '?').join(',');
    conditions.push(
      `(json_valid(permits.tags) AND EXISTS (` +
        `SELECT 1 FROM json_each(permits.tags) AS jt WHERE jt.value IN (${placeholders})))`
    );
    params.push(...filters.tags);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

/**
 * Build the `SELECT ... FROM permits` feed query for the given filters, sort and
 * page window. `limit`/`offset` are always the last two params. Emits no `WHERE`
 * when no filter is active. See `buildFeedWhere` for the predicate construction.
 */
export function buildFeedQuery(filters: FeedFilters, limit: number, offset: number): FeedQuery {
  const { where, params } = buildFeedWhere(filters);
  const orderBy = SORT_SQL[filters.sort ?? 'newest'];

  params.push(limit, offset);

  return {
    sql: `SELECT * FROM permits ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params,
  };
}

/**
 * Build the total-count query for the given filters — `SELECT COUNT(*)` over the
 * same `WHERE` the feed uses, with no `ORDER BY` / `LIMIT` / `OFFSET`. The count
 * column is aliased `c`. Because it shares `buildFeedWhere`, the number it returns
 * always matches how many rows the feed would list for the identical filters.
 */
export function buildFeedCountQuery(filters: FeedFilters): FeedQuery {
  const { where, params } = buildFeedWhere(filters);
  return {
    sql: `SELECT COUNT(*) as c FROM permits ${where}`,
    params,
  };
}
