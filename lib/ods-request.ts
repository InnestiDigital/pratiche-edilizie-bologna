import { DATASETS, BOLOGNA_API_BASE, API_LIMIT, type DatasetKey } from './constants';

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

/** ODS `refine` facet field used to scope a query to one filing year. */
export const YEAR_REFINE_FIELD = 'richiesta_anno_prot';

/** Build the records endpoint URL for one dataset (fills the `{slug}` template). */
export function buildOdsUrl(datasetKey: DatasetKey): string {
  return BOLOGNA_API_BASE.replace('{slug}', DATASETS[datasetKey].slug);
}

export interface PageParamsOptions {
  /** Zero-based record offset for this page. */
  offset: number;
  /** Page size. Defaults to {@link API_LIMIT}. */
  limit?: number;
  /** When set, scope the page to a single filing year via the ODS refine facet. */
  year?: number;
}

function requireNonNegativeInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * Build the query params for one page fetch. `limit`/`offset` are always
 * present; `year`, when given, adds the `richiesta_anno_prot:<year>` refine.
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

  return params;
}

/**
 * Params for the full-scan count probe: fetch a single record purely to read
 * the envelope's `total_count` and decide whether the dataset fits under the
 * ODS `MAX_OFFSET` cap or must be swept per year.
 */
export function buildCountProbeParams(): Record<string, string> {
  return { limit: '1', offset: '0' };
}
