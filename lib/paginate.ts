/**
 * Pure pagination helpers for walking the Comune di Bologna open-data (ODS)
 * endpoints. The control logic (offset stepping, the hard offset cap, which
 * year windows to walk) is separated from transport so a multi-page walk can
 * be tested without a network, and `lib/sync.ts` has a single source of truth
 * for "how do we page".
 */

/** One page of results as returned by the ODS records endpoint. */
export interface Page<T> {
  results: T[];
}

/**
 * ODS refuses `offset + limit > 10000` (HTTP 400). We stop once the next
 * offset would reach this cap; the caller narrows the query (by year) to reach
 * rows beyond it. Kept just under 10000 to leave room for a full `API_LIMIT`
 * page at the last valid offset.
 */
export const MAX_OFFSET = 9900;

/**
 * Walk an offset-paginated endpoint from offset 0, accumulating every row. The
 * page fetch is injected (given the current offset) so the walk is transport-
 * agnostic and testable. Stops on the first of:
 *   - an empty page (nothing more to read),
 *   - a short page (`results.length < limit` → last page),
 *   - the offset reaching {@link MAX_OFFSET} (ODS hard cap).
 *
 * `limit` must be a positive integer — it is the page size the caller requested
 * from the endpoint and the threshold for detecting the final page.
 */
export async function walkPages<T>(
  fetchPage: (offset: number) => Promise<Page<T>>,
  limit: number
): Promise<T[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`walkPages: limit must be a positive integer, got ${limit}`);
  }

  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { results } = await fetchPage(offset);
    if (results.length === 0) break;
    all.push(...results);
    if (results.length < limit) break;
    offset += limit;
    if (offset >= MAX_OFFSET) break;
  }
  return all;
}

/**
 * The inclusive list of years to refine on for a "recent" sync: the last
 * `yearsBack` calendar years ending at (and including) `currentYear`.
 * `yearRange(2026, 2) === [2025, 2026]`. `yearsBack <= 0` yields an empty list.
 */
export function recentYears(currentYear: number, yearsBack: number): number[] {
  const years: number[] = [];
  for (let year = currentYear - yearsBack + 1; year <= currentYear; year++) {
    years.push(year);
  }
  return years;
}

/**
 * The inclusive list of years for a full historical scan, from `fromYear` up
 * to and including `currentYear`. Used when a dataset's total row count exceeds
 * {@link MAX_OFFSET} and must be walked one year at a time to page past the cap.
 */
export function fullScanYears(fromYear: number, currentYear: number): number[] {
  const years: number[] = [];
  for (let year = fromYear; year <= currentYear; year++) {
    years.push(year);
  }
  return years;
}
