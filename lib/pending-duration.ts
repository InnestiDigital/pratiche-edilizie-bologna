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
 * and unit-testable, mirroring the rest of `lib/`. The date arithmetic + Italian
 * span phrasing come from the shared `duration-span` helpers (single source of truth
 * with the "Conclusa in …" processing-duration caption).
 */

import { dateDayIndex, isoDayIndex, italianDaySpan } from './duration-span';

/**
 * Build the "In attesa da …" caption for a pending permit, or `null` when the
 * request date is missing/unparseable (caller renders nothing).
 *
 * The caller is responsible for only invoking this on an `in_attesa` permit; the
 * function itself just measures the span from the request date to `now`.
 *
 * - a future / clock-skewed request date → span clamped to 0 → "meno di un giorno"
 * - singular/plural agreement on every unit; months capped at 11 (see `italianDaySpan`)
 */
export function pendingDurationLabel(
  requestIso: string | null | undefined,
  now: Date
): string | null {
  if (requestIso == null) return null;
  const trimmed = requestIso.trim();
  if (trimmed === '') return null;

  const then = isoDayIndex(trimmed);
  if (then === null) return null;

  const days = Math.max(0, dateDayIndex(now) - then);

  return `In attesa da ${italianDaySpan(days)}`;
}
