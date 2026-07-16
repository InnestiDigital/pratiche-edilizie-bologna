import { BOLOGNA_API_BASE, API_LIMIT } from './constants';
import { SOURCES, YEAR_REFINE_FIELD, type SourceKey } from './sources';

/**
 * Pure construction of the requests we make against the Bologna open-data
 * (ODS v2.1) records endpoint: the per-dataset URL and the query params for a
 * single page fetch. `sync.ts` used to build these inline in three places
 * (recent-window walk, full-scan count probe, full-scan year walk), each
 * repeating the `{slug}` templating and the `richiesta_anno_prot:<year>`
 * refine string. That refine field name is the untyped contract with the ODS
 * refine facet — a silent typo returns an unrefined (or empty) page with no
 * error — so it lives here once, behind a test, and `sync.ts` delegates.
 *
 * This module is deliberately expo/native-free: URL + param strings only, no
 * transport, no SQLite, no dataset iteration.
 */

/**
 * ODS `refine` facet field used to scope a query to one filing year. Sourced from
 * `sources.ts` (single source of truth — it lives in the edilizia sweep strategy)
 * and re-exported here for back-compat with existing callers/tests.
 */
export { YEAR_REFINE_FIELD };

/**
 * Build the records endpoint URL for one source (fills the `{slug}` template).
 * Keyed by `SourceKey` and sourced from `SOURCES[key].slug` — the single source
 * of truth for every source's slug (edilizia slugs are copied from `DATASETS`,
 * so the URL is byte-identical to before for pdc/scia/cila).
 */
export function buildOdsUrl(sourceKey: SourceKey): string {
  return BOLOGNA_API_BASE.replace('{slug}', SOURCES[sourceKey].slug);
}

export interface PageParamsOptions {
  /** Zero-based record offset for this page. */
  offset: number;
  /** Page size. Defaults to {@link API_LIMIT}. */
  limit?: number;
  /** When set, scope the page to a single filing year via the ODS refine facet. */
  year?: number;
  /**
   * When set, an ODS-QL `where` clause scoping the page (e.g. a date range).
   * Passed through verbatim — build it with {@link buildDateRangeWhere} rather
   * than inline so the query-language syntax lives behind one tested helper.
   * A source uses either `year` (refine facet) or `where` (query language), not
   * both.
   */
  where?: string;
  /**
   * When set, an ODS `select` clause restricting the page to a comma-separated
   * field list (e.g. `recordid,denominazione,geopoint`). Passed through verbatim.
   * Used by a static layer whose dataset carries no natural per-row id field in the
   * default payload, so it must explicitly `select` the meta `recordid` to key its
   * markers (see `static-layer-sync.ts`); the categories never set it, so their
   * full-payload query is byte-identical to before.
   */
  select?: string;
}

function requireNonNegativeInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/** `YYYY-MM-DD` — the plain calendar-date form the ODS `date'...'` literal takes. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build a half-open ODS-QL date-range `where` clause:
 * `<field>>=date'<fromInclusive>' AND <field><date'<toExclusive>'`.
 *
 * Used by the `date-range` sweep strategy for datasets that expose no exact-year
 * facet (istanze-commercio, segnalazioni), swept one year window at a time. The
 * upper bound is EXCLUSIVE on purpose: the swept fields can be DATETIMEs, so a
 * closed `<=date'Y-12-31'` would drop every record timestamped during Dec 31 —
 * the half-open `<date'(Y+1)-01-01'` keeps them.
 *
 * Bounds are validated as `YYYY-MM-DD`; a malformed literal would otherwise
 * produce a silently wrong (or empty) page with no error, so it is rejected here
 * with `RangeError`, mirroring the numeric validation in {@link buildPageParams}.
 *
 * @throws {RangeError} when either bound is not a `YYYY-MM-DD` string.
 */
export function buildDateRangeWhere(
  field: string,
  fromInclusive: string,
  toExclusive: string
): string {
  if (!ISO_DATE.test(fromInclusive)) {
    throw new RangeError(`fromInclusive must be a YYYY-MM-DD date, got ${fromInclusive}`);
  }
  if (!ISO_DATE.test(toExclusive)) {
    throw new RangeError(`toExclusive must be a YYYY-MM-DD date, got ${toExclusive}`);
  }
  return `${field}>=date'${fromInclusive}' AND ${field}<date'${toExclusive}'`;
}

/**
 * Build an open-ended ("since") ODS-QL `where` clause: `<field>>=date'<isoDate>'`.
 *
 * Used by the `future-window` sweep strategy (eventi): the sync clock reads
 * "today minus `lookBackDays`" and this pure builder turns that plain date into
 * the query, keeping only records from that day onward (a forward-looking feed —
 * most of the ~30k historical events are never fetched). No upper bound: future
 * events extend arbitrarily far, and the walk truncates at {@link MAX_OFFSET}
 * (currently far above the future-window size).
 *
 * `isoDate` is validated as `YYYY-MM-DD` for the same reason as
 * {@link buildDateRangeWhere}: a malformed literal would silently return a wrong
 * (or empty) page with no error, so it is rejected here with `RangeError`.
 *
 * @throws {RangeError} when `isoDate` is not a `YYYY-MM-DD` string.
 */
export function buildSinceWhere(field: string, isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must be a YYYY-MM-DD date, got ${isoDate}`);
  }
  return `${field}>=date'${isoDate}'`;
}

/**
 * Build an ODS-QL `in`-list `where` clause scoping a page to a set of street
 * codes: `codvia in (12, 47, 350)`.
 *
 * This is the network contract for the P4 "widen Nei dintorni to edilizia"
 * scoped gazetteer fetch (docs/P4-map-radius.md §3, director mandate #1): the
 * `rifter_civici_pt` gazetteer is ~77 600 rows — far past the ODS `MAX_OFFSET`
 * (9900) cap, so a naive full walk silently loses ~87% of it. Instead we fetch
 * ONLY the civici for the `codvia` values that actually appear in local edilizia
 * rows (a small subset of all Bologna streets), batched under the cap by
 * {@link import('./civici-fetch-plan').planCiviciFetch}. Each batch's `codvia`
 * set becomes one of these clauses.
 *
 * Codes are emitted as bare integers (the ODS `codvia` field is numeric, so no
 * quoting) in the order given — `planCiviciFetch` passes an ascending, de-duped
 * set, so the string is deterministic. Each is validated as a non-negative
 * integer for the same reason as {@link buildDateRangeWhere}: a stray
 * `NaN`/negative would otherwise produce a silently malformed (or empty) page
 * with no error.
 *
 * @throws {RangeError} when `codvias` is empty or any code is not a
 *   non-negative integer.
 */
export function buildCodviaInWhere(codvias: readonly number[]): string {
  if (codvias.length === 0) {
    throw new RangeError('buildCodviaInWhere: codvias must be a non-empty list');
  }
  for (const codvia of codvias) {
    requireNonNegativeInt('codvia', codvia);
  }
  return `codvia in (${codvias.join(', ')})`;
}

/**
 * Build the query params for one page fetch. `limit`/`offset` are always
 * present; `year`, when given, adds the `richiesta_anno_prot:<year>` refine, and
 * `where`, when given, is passed through verbatim as the ODS-QL `where` clause.
 * Numbers are validated here (the ingress where a stray `NaN`/negative would
 * otherwise become a silently malformed `offset=NaN` / `limit=-1` query string)
 * and rejected with `RangeError`, mirroring `paginate.walkPages`.
 *
 * @throws {RangeError} when `offset`/`year` is not a non-negative integer, or
 *   `limit` is not a positive integer.
 */
export function buildPageParams({
  offset,
  limit = API_LIMIT,
  year,
  where,
  select,
}: PageParamsOptions): Record<string, string> {
  requireNonNegativeInt('offset', offset);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }

  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };

  if (year !== undefined) {
    requireNonNegativeInt('year', year);
    params.refine = `${YEAR_REFINE_FIELD}:${year}`;
  }

  if (where !== undefined) {
    params.where = where;
  }

  if (select !== undefined) {
    params.select = select;
  }

  return params;
}
