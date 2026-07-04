/**
 * Pure builder for the "Conclusa in …" processing-duration caption on permit detail.
 *
 * Once a permit has been closed/granted, the single most useful fact a resident
 * takes from it is **how long the Comune took** — the span between the request date
 * (`source_updated_at` = `richiesta_data`) and the closing date (`date_issued`,
 * labelled "Pratica conclusa" in the timeline). This turns those two dates into
 * "Conclusa in 3 mesi", the concluded-permit counterpart to the pending permit's
 * "In attesa da …" caption.
 *
 * Both dates are **date-only** `YYYY-MM-DD` strings, so the span is measured from
 * UTC calendar-day indices (shared `duration-span` helpers) to avoid the
 * timezone-midnight day shift, and the Italian phrasing is the same single source
 * of truth as `pending-duration`.
 *
 * Unlike the pending caption — which clamps a future request date to 0 — a closing
 * date that falls *before* the request date is treated as inconsistent/messy open
 * data and returns `null` (no caption) rather than a misleading "meno di un giorno".
 * The caller is expected to skip this for still-pending permits (which have no
 * closing date anyway).
 */

import { isoDayIndex, italianDaySpan } from './duration-span';

/**
 * Build the "Conclusa in …" caption from a permit's request and closing dates,
 * or `null` when it should not render:
 *
 * - either date missing / empty / unparseable → `null`
 * - closing strictly before request (illogical / messy data) → `null`
 * - closing on or after request → "Conclusa in {span}" (same-day → "meno di un giorno")
 */
export function processingDurationLabel(
  requestIso: string | null | undefined,
  closingIso: string | null | undefined
): string | null {
  if (requestIso == null || closingIso == null) return null;

  const request = requestIso.trim();
  const closing = closingIso.trim();
  if (request === '' || closing === '') return null;

  const start = isoDayIndex(request);
  const end = isoDayIndex(closing);
  if (start === null || end === null) return null;

  const days = end - start;
  if (days < 0) return null;

  return `Conclusa in ${italianDaySpan(days)}`;
}
