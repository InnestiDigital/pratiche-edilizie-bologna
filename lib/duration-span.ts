/**
 * Shared pure helpers for turning ODS/ISO date strings into an Italian
 * whole-day duration phrase.
 *
 * Two detail-screen captions measure a span between date-only values and render
 * it as human Italian: `pending-duration.ts` ("In attesa da …", request → now)
 * and `processing-duration.ts` ("Conclusa in …", request → closing). Both need
 * the exact same two primitives — a UTC calendar-day index for a date string and
 * the singular/plural day-span phrase — so they live here as the single source
 * of truth rather than being duplicated per caption.
 *
 * Kept free of expo/react-native and clock access (callers inject any `Date`),
 * so the mapping is deterministic and unit-tested in Node like the rest of `lib/`.
 *
 * Spans are computed from UTC calendar-day indices on both sides rather than
 * `new Date(dateOnly)` arithmetic — this avoids the timezone-midnight day shift
 * that `formatItDate` / `permit-timeline` guard against for the same reason.
 */

export const MS_PER_DAY = 86_400_000;
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * UTC calendar-day index (days since the Unix epoch) for the leading `YYYY-MM-DD`
 * of an ISO/ODS date string, or `null` when there is no parseable date prefix.
 */
export function isoDayIndex(raw: string): number | null {
  const match = ISO_DATE_PREFIX.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(utc)) return null;
  return Math.floor(utc / MS_PER_DAY);
}

/** UTC calendar-day index for a `Date` instant (its wall-clock day in UTC). */
export function dateDayIndex(now: Date): number {
  return Math.floor(now.getTime() / MS_PER_DAY);
}

/**
 * Whole-day span → Italian duration phrase with correct singular/plural
 * agreement (giorno/giorni, settimana/settimane, mese/mesi, anno/anni).
 * Months are capped at 11 so the phrase never reads "12 mesi" the day before a
 * year. A non-positive span reads "meno di un giorno".
 */
export function italianDaySpan(days: number): string {
  if (days <= 0) return 'meno di un giorno';
  if (days === 1) return '1 giorno';
  if (days < 7) return `${days} giorni`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 settimana' : `${weeks} settimane`;
  }
  if (days < 365) {
    const months = Math.min(11, Math.floor(days / 30));
    return months === 1 ? '1 mese' : `${months} mesi`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 anno' : `${years} anni`;
}
