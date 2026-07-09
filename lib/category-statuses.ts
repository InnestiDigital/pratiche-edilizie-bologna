import { STATUS_PATTERNS } from './constants';
import { Category, CATEGORY_HAS_STATUS_SIGNAL } from './sources';

/**
 * Which normalized `status` values a category's rows can actually carry. Derived
 * from the same normalizers that write the column, so the feed's Stato filter can
 * be scoped to the selected category instead of offering every category's statuses
 * (a cantieri view listing edilizia-only outcomes like "Diniegata" is a dead filter:
 * tapping it can never match a cantieri row and silently empties the feed).
 *
 * - edilizia + commercio share the STATUS_PATTERNS vocabulary — `source-commercio.ts`
 *   runs the same `normalizeStatus` over `esito_pratica` that `normalize.ts` runs for
 *   edilizia — plus `'altro'`, that normalizer's fallback for an unrecognized esito.
 * - cantieri has its own tiny normalizer (`source-cantieri.ts` `normalizeCantiereStatus`).
 * - eventi/segnalazioni write a constant, signal-less status (`CATEGORY_HAS_STATUS_SIGNAL`
 *   is false); their single value is listed for completeness but never surfaces as a
 *   filter (see `applicableStatuses`).
 *
 * Exhaustive `Record<Category, ...>`: a sixth category cannot ship without declaring
 * its statuses here, mirroring the other exhaustive maps in `sources.ts`.
 */
const EDILIZIA_STATUSES: readonly string[] = [...STATUS_PATTERNS.map(([key]) => key), 'altro'];

export const CATEGORY_STATUSES: Record<Category, readonly string[]> = {
  edilizia: EDILIZIA_STATUSES,
  commercio: EDILIZIA_STATUSES,
  cantieri: ['in_corso', 'concluso', 'altro'],
  eventi: ['in_programma'],
  segnalazioni: ['altro'],
};

/**
 * The set of `status` keys the feed's Stato filter should offer for the current
 * category scope:
 * - `null` (no set) when the feed is unscoped ("Tutte") — every status can match
 *   some row, so nothing is dead; the caller shows the full status list.
 * - an EMPTY set for a no-signal category (eventi/segnalazioni) — their status is a
 *   constant hidden on the card, so the Stato section is meaningless; the caller
 *   hides it entirely.
 * - the category's own status vocabulary for a signal category, so only statuses
 *   that can actually match are offered.
 */
export function applicableStatuses(activeCategory: Category | null): ReadonlySet<string> | null {
  if (activeCategory === null) return null;
  if (!CATEGORY_HAS_STATUS_SIGNAL[activeCategory]) return new Set();
  return new Set(CATEGORY_STATUSES[activeCategory]);
}

/**
 * Drop any active status that no longer applies when the feed narrows to
 * `activeCategory`, so switching category can never leave a now-hidden status
 * silently filtering (and emptying) the feed. Under "Tutte" (`null`) nothing is
 * scoped away, so the selection is returned unchanged.
 */
export function pruneStatusesForCategory(
  activeStatuses: ReadonlySet<string>,
  activeCategory: Category | null
): Set<string> {
  const applicable = applicableStatuses(activeCategory);
  if (applicable === null) return new Set(activeStatuses);
  return new Set([...activeStatuses].filter((s) => applicable.has(s)));
}
