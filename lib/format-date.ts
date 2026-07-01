/**
 * Pure, timezone-safe formatting of the raw ODS date strings the app stores on a
 * permit (`date_issued` = `chiusura_pratica_data`, `source_updated_at` = `richiesta_data`).
 *
 * These come off the Bologna open-data API as strings (see `schemas.ts`) — almost
 * always `YYYY-MM-DD`, occasionally a full ISO datetime. The feed and detail screens
 * used to render them raw, showing `2024-03-15` to an Italian user.
 *
 * We deliberately do NOT go through `new Date(...)`: `new Date('2024-03-15')` parses
 * as UTC midnight, so `toLocaleDateString` in any timezone west of UTC would render
 * the *previous* day. Instead we lift the date parts straight out of the string and
 * reformat to Italian `dd/mm/yyyy`, which is deterministic and TZ-independent.
 *
 * Robustness contract: this touches user-facing display, so it must never throw and
 * never surface `Invalid Date`. Anything it can't confidently parse is returned
 * trimmed and unchanged (better a raw string than a crash or a wrong day).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Format a raw ODS date string as Italian `dd/mm/yyyy`.
 *
 * - `null` / empty / whitespace-only → `null` (caller decides whether to render a row)
 * - leading `YYYY-MM-DD` (with or without a time suffix) → `dd/mm/yyyy`
 * - anything else → the input, trimmed, unchanged (fallback, never a crash)
 */
export function formatItDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const match = ISO_DATE.exec(trimmed);
  if (!match) return trimmed;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
