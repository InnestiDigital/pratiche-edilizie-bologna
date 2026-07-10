/**
 * Pure builder for an event's human "when" line — the single source of truth for
 * how an evento's date(s) read across the app.
 *
 * An evento carries its FUTURE start date in `extra.start` (its
 * `source_updated_at` is NULL by design — see source-eventi.ts) and its end date
 * in `date_issued`. The feed card and the permit-detail header both need to show
 * that span the same way; this helper is that one formatter so the two can never
 * drift (the class of skew fixed for distances via `formatApproxDistance` and for
 * filing acronyms via `FILING_TYPE_ABBREV`).
 *
 * Rules (mirroring the original feed-card logic):
 *   - start + a DIFFERENT end  → "Dal <start> al <end>" (a multi-day run)
 *   - start only (or end == start) → "Il <start>"
 *   - end only (no start)       → "Il <end>"
 *   - neither                   → null (caller renders no date row)
 *
 * Kept pure (no native imports, no `new Date`) so it is unit-tested in Node; the
 * dates are formatted through the TZ-safe `formatItDate` off the `YYYY-MM-DD`
 * string prefix.
 */

import { formatItDate } from './format-date';

export function formatEventoWhen(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
): string | null {
  const start = formatItDate(startRaw ?? null);
  const end = formatItDate(endRaw ?? null);
  if (start && end && end !== start) return `Dal ${start} al ${end}`;
  if (start) return `Il ${start}`;
  if (end) return `Il ${end}`;
  return null;
}
