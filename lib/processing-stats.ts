/**
 * Pure aggregate for the sync-screen "Tempi di rilascio" card.
 *
 * The per-permit `processing-duration.ts` caption tells a resident how long *one*
 * released permit took. This is the bird's-eye counterpart: across every released
 * permit in the local database, what is the **typical** time from the request
 * (`richiesta_data` = `source_updated_at`) to the closing/release (`date_issued`)?
 * It answers the question a resident about to file has — "how long should I expect
 * to wait?" — with the median (robust to a few outliers) plus the observed range.
 *
 * Spans are day-counts derived from UTC calendar-day indices (shared
 * `duration-span` helpers, the same primitive `pending`/`processing` use), so the
 * whole thing is clock-free, deterministic, and unit-tested in Node. A pair whose
 * closing precedes the request is treated as messy open data and dropped, matching
 * `processing-duration`'s per-permit rule.
 */

import { isoDayIndex, italianDaySpan } from './duration-span';

/** A permit's request + closing dates, as stored (`YYYY-MM-DD` or null). */
export interface ProcessingDatePair {
  request: string | null;
  closing: string | null;
}

export interface ProcessingStats {
  /** Number of permits contributing a valid (non-negative) span. */
  count: number;
  /** Median day-span — the "typical" release time. */
  medianDays: number;
  /** Fastest observed release, in days. */
  minDays: number;
  /** Slowest observed release, in days. */
  maxDays: number;
}

/**
 * Day-span (closing − request) for one pair, or `null` when it should not count:
 * either date missing / unparseable, or the closing strictly precedes the request
 * (illogical / messy data — a released permit cannot close before it was filed).
 */
export function processingSpanDays(request: string | null, closing: string | null): number | null {
  if (!request || !closing) return null;
  const r = isoDayIndex(request);
  const c = isoDayIndex(closing);
  if (r === null || c === null) return null;
  const span = c - r;
  return span < 0 ? null : span;
}

/**
 * Aggregate the valid request→closing spans into a median/min/max summary, or
 * `null` when fewer than `minSample` valid spans exist — too small a sample to
 * state a "typical" time honestly (one or two permits is anecdote, not a trend).
 */
export function buildProcessingStats(
  pairs: ProcessingDatePair[],
  minSample = 3
): ProcessingStats | null {
  const spans: number[] = [];
  for (const p of pairs) {
    const s = processingSpanDays(p.request, p.closing);
    if (s !== null) spans.push(s);
  }
  if (spans.length < minSample) return null;

  spans.sort((a, b) => a - b);
  const n = spans.length;
  const mid = n >> 1;
  const medianDays = n % 2 === 1 ? spans[mid] : Math.round((spans[mid - 1] + spans[mid]) / 2);

  return { count: n, medianDays, minDays: spans[0], maxDays: spans[n - 1] };
}

/**
 * Italian "from … to …" phrase for the observed release-time range, collapsing to
 * a single phrase when the fastest and slowest round to the same words (e.g. both
 * "2 mesi") so the card never reads "da 2 mesi a 2 mesi".
 */
export function processingRangeLabel(stats: ProcessingStats): string {
  const lo = italianDaySpan(stats.minDays);
  const hi = italianDaySpan(stats.maxDays);
  return lo === hi ? lo : `da ${lo} a ${hi}`;
}
