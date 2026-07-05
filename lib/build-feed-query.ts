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
//
// NULL handling: SQLite ranks NULL below every value, so a DESC sort already sinks
// date-less rows to the bottom (`request_newest`, `closing_newest` need no guard),
// but an ASC sort would float them to the TOP. That is wrong for `request_oldest`
// ("Data richiesta (meno recenti)") — a resident asking for the oldest requests
// should see the oldest DATED permits first, not the undated ones. The leading
// `source_updated_at IS NULL` term (0 for a real date, 1 for NULL) pushes the
// undated rows last regardless of the ASC primary. `oldest` needs no such guard:
// `first_seen_at` is stamped NOT NULL on every insert, so it is never NULL.
const SORT_SQL: Record<SortOption, string> = {
  newest: 'first_seen_at DESC, id DESC',
  oldest: 'first_seen_at ASC, id ASC',
  request_newest: 'source_updated_at DESC, id DESC',
  request_oldest: 'source_updated_at IS NULL, source_updated_at ASC, id ASC',
  closing_newest: 'date_issued DESC, id DESC',
};

export interface FeedFilters {
  zones: Quartiere[];
  filingTypes: FilingType[];
  tags: string[];
  searchQuery?: string;
  statuses?: string[];
  onlyNew?: boolean;
  onlyFavorites?: boolean;
  /** Keep only permits the user has attached a personal note to (see `permit_notes`). */
  onlyNoted?: boolean;
  /**
   * Inclusive lower bound on the request date (`source_updated_at`), as a plain
   * `YYYY-MM-DD` string — the time-period filter. See `lib/feed-period.ts` for how
   * a `FeedPeriod` becomes this bound. A permit with a NULL request date fails the
   * `>=` comparison and is excluded, which is the intended behaviour for a
   * "requested since …" filter.
   */
  requestedAfter?: string;
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

/**
 * If a feed search term looks like a permit protocol / number, build the set of
 * SQLite `LIKE` patterns (already LIKE-escaped, each wrapped as `%group%`) to match
 * the stored `source_id` (`<dataset>-<year>-<number>`, e.g. `PDC-2024-000481`).
 *
 * On every card and the detail header the protocol is shown as `<number>/<year>`
 * (e.g. `000481/2024`) — the reverse field order of the source_id — so we cannot
 * build one ordered pattern. Instead we split the query on the separators a user
 * would type (`/`, `-`, whitespace) and return one `%group%` pattern per numeric
 * group; the caller ANDs them, which is order-independent: `000481/2024` becomes
 * `%000481%` AND `%2024%`, both of which are substrings of `PDC-2024-000481`.
 * A bare number (`481`) returns the single `%481%`.
 *
 * Returns an empty array when the term contains any non-protocol character (a
 * letter — i.e. an address / procedure search), so those searches are left
 * untouched and never gain a spurious source_id branch.
 */
export function buildProtocolSearchPatterns(query: string): string[] {
  const trimmed = query.trim();
  // Only digits and the separators a protocol is written with. Any letter → this
  // is a text search, not a protocol lookup.
  if (!/^[\d/\s-]+$/.test(trimmed)) return [];
  return trimmed
    .split(/[/\s-]+/)
    .filter(Boolean)
    .map((group) => `%${escapeLike(group)}%`);
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
    const q = `%${escapeLike(filters.searchQuery)}%`;
    const clauses = ["address LIKE ? ESCAPE '\\'", "procedimento LIKE ? ESCAPE '\\'"];
    const searchParams: string[] = [q, q];
    // The search also matches the resident's own personal note on a permit, so a
    // term they jotted ("Soprintendenza", a phone number) finds the annotated
    // permit — the note is now a first-class, searchable field alongside the feed
    // preview and "Solo con note" filter. Matched via a correlated EXISTS on the
    // permit_notes table (keyed by source_id, like onlyNoted) so LIMIT/OFFSET and
    // pagination stay correct; ORed into the search group so it widens, never
    // narrows, the match. An emptied note is deleted (see normalizeNote), so a
    // present row always holds real text.
    clauses.push(
      'EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id ' +
        "AND permit_notes.note LIKE ? ESCAPE '\\')"
    );
    searchParams.push(q);
    // A protocol/number query additionally matches the source_id. Each numeric
    // group is ANDed (order-independent) so the displayed `number/year` form finds
    // the `dataset-year-number` source_id; ORed with the text search above so a
    // bare number that also appears in an address still matches both ways.
    const protocolPatterns = buildProtocolSearchPatterns(filters.searchQuery);
    if (protocolPatterns.length > 0) {
      const protocolClause = protocolPatterns
        .map(() => "source_id LIKE ? ESCAPE '\\'")
        .join(' AND ');
      clauses.push(`(${protocolClause})`);
      searchParams.push(...protocolPatterns);
    }
    conditions.push(`(${clauses.join(' OR ')})`);
    params.push(...searchParams);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`status IN (${filters.statuses.map(() => '?').join(',')})`);
    params.push(...filters.statuses);
  }

  if (filters.requestedAfter) {
    // Time-period filter: keep permits requested on/after the bound. Compared
    // lexicographically — both sides are `YYYY-MM-DD` strings, so no date parsing.
    conditions.push('source_updated_at >= ?');
    params.push(filters.requestedAfter);
  }

  if (filters.onlyNew) {
    conditions.push('is_new = 1');
  }

  if (filters.onlyFavorites) {
    // Correlated EXISTS against the favorites table (keyed by source_id), so the
    // saved-only filter is applied in SQL — LIMIT/OFFSET and the feed's "full
    // page?" pagination stay correct, exactly as with the tag filter. No bind
    // params: the predicate is fully static.
    conditions.push(
      'EXISTS (SELECT 1 FROM favorites WHERE favorites.source_id = permits.source_id)'
    );
  }

  if (filters.onlyNoted) {
    // Correlated EXISTS against the permit_notes table (keyed by source_id), so
    // the annotated-only filter runs in SQL like onlyFavorites — LIMIT/OFFSET and
    // pagination stay correct. An emptied note deletes its row (see normalizeNote),
    // so any permit_notes row means a real, non-empty note. No bind params.
    conditions.push(
      'EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id)'
    );
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
