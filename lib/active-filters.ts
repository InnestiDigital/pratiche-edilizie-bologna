import { STATUS_LABELS, TAG_LABELS } from './constants';
import { SORT_LABELS, type SortOption } from './build-feed-query';
import { PERIOD_LABELS, type FeedPeriod } from './feed-period';
import { statusLabelFor } from './status-label';
import type { Category } from './sources';

/**
 * One dismissible summary chip for the feed's active-filter row.
 *
 * `key` is the stable removal handle the feed screen switches on to undo exactly
 * this filter; `label` is the Italian display text. The zone filter collapses to a
 * single chip (naming the one selected quartiere, or "N quartieri" for a subset) so
 * a partial zone selection can't flood the row.
 */
export type ActiveFilterChip = { key: string; label: string };

export interface ActiveFilterState {
  /** Currently-selected zones. Filtering is active when this is a strict subset of all. */
  zones: string[];
  /** Total number of selectable zones — the "no zone filter" baseline. */
  totalZones: number;
  /** Selected time period; filtering is active when this differs from `defaultPeriod`. */
  period: FeedPeriod;
  /** The default period (`'all'`); any other value surfaces a removable chip. */
  defaultPeriod: FeedPeriod;
  statuses: string[];
  /**
   * The single category the feed is scoped to, or null under "Tutte". When set,
   * status chip labels agree in gender with that category's domain noun (so an
   * edilizia/commercio `concluso` chip reads "Conclusa", matching the cards +
   * detail pills + the Stato filter list); null keeps the shared generic label.
   */
  activeCategory?: Category | null;
  tags: string[];
  onlyNew: boolean;
  onlyFavorites: boolean;
  /** "Solo con note": only permits the user has annotated. Optional — absent = off. */
  onlyNoted?: boolean;
  /** "Vicino a casa": only rows within the home radius. Optional — absent = off. */
  onlyNearHome?: boolean;
  /** Human radius label ("500 m") shown on the near-home chip. Optional. */
  homeRadiusLabel?: string;
  sort: SortOption;
  /** The default sort; a different sort surfaces a removable chip. */
  defaultSort: SortOption;
}

export const ZONES_CHIP_KEY = 'zones';
export const PERIOD_CHIP_KEY = 'period';
export const ONLY_NEW_CHIP_KEY = 'onlyNew';
export const ONLY_FAVORITES_CHIP_KEY = 'onlyFavorites';
export const ONLY_NOTED_CHIP_KEY = 'onlyNoted';
export const ONLY_NEAR_HOME_CHIP_KEY = 'onlyNearHome';
export const SORT_CHIP_KEY = 'sort';
export const STATUS_CHIP_PREFIX = 'status:';
export const TAG_CHIP_PREFIX = 'tag:';

/**
 * Build the ordered list of active-filter chips from the feed's filter state.
 *
 * Pure and total: no chips means no active filters. Order is fixed (zones →
 * period → statuses → tags → only-new → only-saved → only-noted → near-home →
 * sort) so stable across re-renders. The feed screen maps each `key` back to a
 * removal action.
 */
export function buildActiveFilterChips(state: ActiveFilterState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (state.zones.length < state.totalZones) {
    const label = state.zones.length === 1 ? state.zones[0] : `${state.zones.length} quartieri`;
    chips.push({ key: ZONES_CHIP_KEY, label });
  }

  if (state.period !== state.defaultPeriod) {
    chips.push({ key: PERIOD_CHIP_KEY, label: PERIOD_LABELS[state.period] });
  }

  for (const s of state.statuses) {
    const label = state.activeCategory
      ? statusLabelFor(s, state.activeCategory, STATUS_LABELS[s] ?? s)
      : (STATUS_LABELS[s] ?? s);
    chips.push({ key: `${STATUS_CHIP_PREFIX}${s}`, label });
  }

  for (const t of state.tags) {
    chips.push({ key: `${TAG_CHIP_PREFIX}${t}`, label: TAG_LABELS[t] ?? t });
  }

  if (state.onlyNew) {
    chips.push({ key: ONLY_NEW_CHIP_KEY, label: 'Solo nuovi' });
  }

  if (state.onlyFavorites) {
    chips.push({ key: ONLY_FAVORITES_CHIP_KEY, label: 'Solo salvate' });
  }

  if (state.onlyNoted) {
    chips.push({ key: ONLY_NOTED_CHIP_KEY, label: 'Solo con note' });
  }

  if (state.onlyNearHome) {
    // Name the radius on the chip ("Vicino a casa · 500 m") when known, so the
    // active scope is legible from the collapsed row, not just an on/off flag.
    const label = state.homeRadiusLabel
      ? `Vicino a casa · ${state.homeRadiusLabel}`
      : 'Vicino a casa';
    chips.push({ key: ONLY_NEAR_HOME_CHIP_KEY, label });
  }

  if (state.sort !== state.defaultSort) {
    chips.push({ key: SORT_CHIP_KEY, label: SORT_LABELS[state.sort] });
  }

  return chips;
}
