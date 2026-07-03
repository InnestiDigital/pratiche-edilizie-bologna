import { STATUS_LABELS, TAG_LABELS } from './constants';
import { SORT_LABELS, type SortOption } from './build-feed-query';

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
  statuses: string[];
  tags: string[];
  onlyNew: boolean;
  onlyFavorites: boolean;
  sort: SortOption;
  /** The default sort; a different sort surfaces a removable chip. */
  defaultSort: SortOption;
}

export const ZONES_CHIP_KEY = 'zones';
export const ONLY_NEW_CHIP_KEY = 'onlyNew';
export const ONLY_FAVORITES_CHIP_KEY = 'onlyFavorites';
export const SORT_CHIP_KEY = 'sort';
export const STATUS_CHIP_PREFIX = 'status:';
export const TAG_CHIP_PREFIX = 'tag:';

/**
 * Build the ordered list of active-filter chips from the feed's filter state.
 *
 * Pure and total: no chips means no active filters. Order is fixed (zones →
 * statuses → tags → only-new → only-saved → sort) so the row is stable across
 * re-renders. The feed screen maps each `key` back to a removal action.
 */
export function buildActiveFilterChips(state: ActiveFilterState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (state.zones.length < state.totalZones) {
    const label = state.zones.length === 1 ? state.zones[0] : `${state.zones.length} quartieri`;
    chips.push({ key: ZONES_CHIP_KEY, label });
  }

  for (const s of state.statuses) {
    chips.push({ key: `${STATUS_CHIP_PREFIX}${s}`, label: STATUS_LABELS[s] ?? s });
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

  if (state.sort !== state.defaultSort) {
    chips.push({ key: SORT_CHIP_KEY, label: SORT_LABELS[state.sort] });
  }

  return chips;
}
