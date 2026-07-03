/**
 * Pure builder for the "In attesa da …" caption on permit detail.
 *
 * A permit whose status is still `in_attesa` (pending) has been sitting in the
 * Comune's queue since its request was filed. The status pill and its plain-Italian
 * description tell the reader *what* pending means; this adds the one fact a resident
 * tracking a permit actually wants — **how long** it has been waiting — turning the
 * request date (`source_updated_at` = `richiesta_data`) into "In attesa da 3 mesi".
 *
 * Kept free of expo/react-native and clock access: the detail screen injects the
 * reference `now` (a real `new Date()` at call time), so the mapping is deterministic
 * and unit-testable, mirroring the rest of `lib/`.
 *
 * The request value is a **date-only** `YYYY-MM-DD` string (not an instant), so the
 * elapsed span is computed from UTC calendar-day indices on both sides rather than
 * `new Date(dateOnly)` arithmetic — this avoids the timezone-midnight day shift that
 * `formatItDate` / `permit-timeline` guard against for the same reason.
 */

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * UTC calendar-day index (days since the Unix epoch) for the leading `YYYY-MM-DD`
 * of an ISO/ODS date string, or `null` when there is no parseable date prefix.
 */
function dayIndex(raw: string): number | null {
  const match = ISO_DATE_PREFIX.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(utc)) return null;
  return Math.floor(utc / MS_PER_DAY);
}

/**
 * Build the "In attesa da …" caption for a pending permit, or `null` when the
 * request date is missing/unparseable (caller renders nothing).
 *
 * The caller is responsible for only invoking this on an `in_attesa` permit; the
 * function itself just measures the span from the request date to `now`.
 *
 * - a future / clock-skewed request date → span clamped to 0 → "meno di un giorno"
 * - singular/plural agreement on every unit (giorno/giorni, settimana/settimane,
 *   mese/mesi, anno/anni); months capped at 11 so it never reads "12 mesi"
 */
export function pendingDurationLabel(
  requestIso: string | null | undefined,
  now: Date
): string | null {
  if (requestIso == null) return null;
  const trimmed = requestIso.trim();
  if (trimmed === '') return null;

  const then = dayIndex(trimmed);
  if (then === null) return null;

  const today = Math.floor(now.getTime() / MS_PER_DAY);
  const days = Math.max(0, today - then);

  return `In attesa da ${spanLabel(days)}`;
}

/** Whole-day span → Italian duration phrase with correct singular/plural agreement. */
function spanLabel(days: number): string {
  if (days <= 0) return 'meno di un giorno';
  if (days === 1) return '1 giorno';
  if (days < 7) return `${days} giorni`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 settimana' : `${weeks} settimane`;
  }
  if (days < 365) {
    // Cap at 11 so the phrase never reads "12 mesi" the day before a year.
    const months = Math.min(11, Math.floor(days / 30));
    return months === 1 ? '1 mese' : `${months} mesi`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 anno' : `${years} anni`;
}
