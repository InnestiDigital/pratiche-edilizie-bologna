/**
 * Pure builder for the permit-detail "vs. the local median" comparison caption.
 *
 * `processing-duration.ts` tells a resident how long *this* concluded permit took
 * ("Conclusa in 2 mesi"). On its own that number has no reference frame — is two
 * months fast or slow for Bologna? This turns the raw span into a judgement by
 * comparing it to the median release time across every released permit in the
 * local database (`buildProcessingStats`), so the caption reads "Più veloce della
 * media" / "In linea con la media" / "Più lenta della media (mediana …)".
 *
 * The comparison is only offered when there are enough local peers for the median
 * to mean something (`minPeers`, default 4 — this permit plus at least three
 * others); with fewer the median is essentially self-referential and the phrase
 * would be noise. A tolerance band around the median collapses near-identical
 * spans to "In linea con la media" so a permit a few days off the median is not
 * dressed up as faster or slower than it really is.
 *
 * Pure + deterministic (no clock, no I/O) — unit-tested in Node like the aggregate
 * it builds on. The permit's own span is part of the median sample (the pairs
 * carry no id to exclude it); with a handful of peers that self-inclusion is
 * negligible and the `minPeers` floor keeps it honest.
 */

import { italianDaySpan } from './duration-span';
import { processingSpanDays, type ProcessingStats } from './processing-stats';

/** Which side of the local median this permit's release time falls on. */
export type ComparisonTone = 'faster' | 'typical' | 'slower';

export interface ProcessingComparison {
  tone: ComparisonTone;
  /** Italian caption, e.g. `Più veloce della media (mediana 2 mesi)`. */
  label: string;
}

/**
 * Compare one permit's request→closing span to the local release-time median, or
 * `null` when no honest comparison can be drawn:
 *
 * - `stats` missing or `stats.count < minPeers` → too small a sample.
 * - the permit's own span is missing / unparseable / backwards → `null`
 *   (same rule as `processingSpanDays`; a still-pending permit has no closing).
 *
 * The tolerance band is `max(7 days, 20% of the median)`: a span inside
 * `[median − band, median + band]` reads "In linea con la media", below it
 * "Più veloce", above it "Più lenta". Every label appends the median for context.
 */
export function buildProcessingComparison(
  request: string | null,
  closing: string | null,
  stats: ProcessingStats | null,
  minPeers = 4
): ProcessingComparison | null {
  if (!stats || stats.count < minPeers) return null;

  const span = processingSpanDays(request, closing);
  if (span === null) return null;

  const median = stats.medianDays;
  const band = Math.max(7, Math.round(median * 0.2));
  const medianPhrase = italianDaySpan(median);

  if (span < median - band) {
    return { tone: 'faster', label: `Più veloce della media (mediana ${medianPhrase})` };
  }
  if (span > median + band) {
    return { tone: 'slower', label: `Più lenta della media (mediana ${medianPhrase})` };
  }
  return { tone: 'typical', label: `In linea con la media (mediana ${medianPhrase})` };
}
