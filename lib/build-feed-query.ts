import type { FilingType, Quartiere } from './constants';

/**
 * Pure builder for the permit-feed SQL query.
 *
 * Kept free of any expo/react-native (db) import so the brittle part of the feed
 * — dynamic WHERE/IN construction, `LIKE` escaping, sort mapping, pagination and
 * strict parameter ordering — is a single pure function that can be unit-tested
 * against its exact `{ sql, params }` output without a native SQLite engine.
 * `queries.getPermits` is a thin wrapper: build → run → JS-side tag post-filter.
 *
 * The tag filter is intentionally NOT part of this SQL — tags are stored as a
 * JSON array and post-filtered in JS after `LIMIT/OFFSET` (see `getPermits`), so
 * it never enters the WHERE clause here.
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

const SORT_SQL: Record<SortOption, string> = {
  newest: 'first_seen_at DESC',
  oldest: 'first_seen_at ASC',
  request_newest: 'source_updated_at DESC',
  request_oldest: 'source_updated_at ASC',
  closing_newest: 'date_issued DESC',
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
 * Build the `SELECT ... FROM permits` feed query for the given filters, sort and
 * page window. Every dynamic fragment appends its placeholders and pushes the
 * matching params in the same order, so the returned `params` array lines up
 * positionally with the `?`s in `sql`. `limit`/`offset` are always the last two
 * params. Emits no `WHERE` when no filter is active.
 */
export function buildFeedQuery(filters: FeedFilters, limit: number, offset: number): FeedQuery {
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = SORT_SQL[filters.sort ?? 'newest'];

  params.push(limit, offset);

  return {
    sql: `SELECT * FROM permits ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params,
  };
}
