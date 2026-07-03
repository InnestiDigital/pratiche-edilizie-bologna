/**
 * Pure helpers for the feed's **time-period filter** (request date).
 *
 * The feed can already narrow by zone / filing type / status / tag; a period
 * filter adds the missing *time* dimension — "pratiche presentate nell'ultimo
 * mese / trimestre / …" — which is what a resident monitoring recent building
 * activity actually wants. It filters on the request date (`source_updated_at`,
 * the "Data richiesta"), stored as a plain `YYYY-MM-DD` string, so the resulting
 * lower bound is compared lexicographically with no timezone conversion.
 *
 * Kept free of any expo/react-native or clock access: the screen injects the
 * reference `now` (a real `new Date()` at call time), so the bound computation is
 * deterministic and unit-testable — mirroring how the rest of `lib/` is built.
 */

export type FeedPeriod = 'all' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year';

/** Selectable periods, in display order (default `all` first). */
export const FEED_PERIOD_ORDER: FeedPeriod[] = [
  'all',
  'last_month',
  'last_3_months',
  'last_6_months',
  'last_year',
];

export const PERIOD_LABELS: Record<FeedPeriod, string> = {
  all: 'Sempre',
  last_month: 'Ultimo mese',
  last_3_months: 'Ultimi 3 mesi',
  last_6_months: 'Ultimi 6 mesi',
  last_year: 'Ultimo anno',
};

/** How many whole calendar months each bounded period reaches back. */
const PERIOD_MONTHS: Record<Exclude<FeedPeriod, 'all'>, number> = {
  last_month: 1,
  last_3_months: 3,
  last_6_months: 6,
  last_year: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * The inclusive lower-bound request date (`YYYY-MM-DD`) for a period relative to
 * `now`, or `null` for `'all'` (no bound).
 *
 * Reads `now`'s LOCAL calendar fields (year / month / day) and subtracts whole
 * calendar months, clamping the day to the target month's length so no invalid
 * date is produced (e.g. 31 Mar − 1 month → 28/29 Feb). No string parsing and no
 * argless `new Date()`: the only `Date` construction is the deterministic
 * `new Date(year, month, 0)` used purely to read a month's day-count.
 */
export function periodStartDate(period: FeedPeriod, now: Date): string | null {
  if (period === 'all') return null;

  const months = PERIOD_MONTHS[period];
  const day = now.getDate();

  // Absolute month index (year*12 + month) makes the subtraction and year rollover
  // trivial and correct for any number of months, positive or crossing a year.
  const targetMonthIndex = now.getFullYear() * 12 + now.getMonth() - months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12; // 0-11, always >= 0

  // Day 0 of the following month resolves to the last day of the target month.
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(clampedDay)}`;
}
