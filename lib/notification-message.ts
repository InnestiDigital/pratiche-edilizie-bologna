// Pure, side-effect-free builder for the "new permits" notification body.
//
// Kept in its own module (no expo / react-native imports) so the brittle
// Italian pluralization can be unit-tested under a plain node environment,
// and so the domain signaling (what text to show) is separated from the UI
// concern (scheduling the OS notification) in notifications.ts.

import { CATEGORIES, CATEGORY_NOUNS, DEFAULT_CATEGORY, type Category } from './sources';

/** The parts of a sync summary the message body needs. */
export interface NotificationSummary {
  totalNew: number;
  totalUpdated: number;
  /** New-permit count per category; categories with 0 new are omitted. */
  newByCategory: Partial<Record<Category, number>>;
}

/** Clamp to a non-negative integer; treats NaN / negatives / floats defensively. */
function safeCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Per-category new part, e.g. "1 nuovo cantiere" / "3 nuovi cantieri". */
function newCategoryPart(category: Category, count: number): string {
  const noun = CATEGORY_NOUNS[category];
  return `${count} ${count === 1 ? noun.singularNew : noun.pluralNew}`;
}

/** "1 pratica aggiornata" / "3 pratiche aggiornate" — one aggregate part. */
function updatedPart(count: number): string {
  return count === 1 ? `${count} pratica aggiornata` : `${count} pratiche aggiornate`;
}

/**
 * Join Italian list parts: "a", "a e b", "a, b e c" — comma between all but the
 * last two, " e " before the final item.
 */
function joinItalian(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/**
 * Build the notification body for a sync run.
 *
 * New permits are broken down per category ("3 nuovi cantieri e 5 nuovi eventi"),
 * iterating {@link CATEGORIES} for a deterministic order. Updates are reported as
 * one aggregate part ("4 pratiche aggiornate") — per-category updated phrasing is
 * YAGNI (updates are overwhelmingly edilizia/commercio esito changes). When the
 * per-category breakdown is empty but there are new permits (a malformed result
 * whose category didn't map), it falls back to the DEFAULT_CATEGORY noun ("N nuove
 * pratiche"), rendered from CATEGORY_NOUNS rather than a duplicated literal.
 *
 * Returns `null` when there is nothing worth notifying about (no genuinely-new
 * and no updated permits) — callers use that to skip firing a notification, so a
 * no-op sync never pings the user. Counts are clamped defensively (NaN / negative
 * / fractional → floored non-negative int).
 */
export function buildNotificationMessage(summary: NotificationSummary): string | null {
  const fresh = safeCount(summary.totalNew);
  const changed = safeCount(summary.totalUpdated);

  if (fresh === 0 && changed === 0) return null;

  const parts: string[] = [];

  // Per-category new parts, in CATEGORIES order for deterministic output.
  for (const category of CATEGORIES) {
    const count = safeCount(summary.newByCategory[category] ?? 0);
    if (count > 0) parts.push(newCategoryPart(category, count));
  }

  // Malformed/absent category breakdown but new permits exist → fall back to the
  // DEFAULT_CATEGORY (edilizia) noun via CATEGORY_NOUNS, the single source of truth
  // for the plural/singular forms (renders the same '1 nuova pratica' / 'N nuove
  // pratiche' strings without duplicating them here).
  if (parts.length === 0 && fresh > 0) {
    parts.push(newCategoryPart(DEFAULT_CATEGORY, fresh));
  }

  if (changed > 0) parts.push(updatedPart(changed));

  return joinItalian(parts);
}
