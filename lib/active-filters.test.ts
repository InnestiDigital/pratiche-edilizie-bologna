import { describe, it, expect } from 'vitest';
import {
  buildActiveFilterChips,
  ZONES_CHIP_KEY,
  ONLY_NEW_CHIP_KEY,
  ONLY_FAVORITES_CHIP_KEY,
  SORT_CHIP_KEY,
  STATUS_CHIP_PREFIX,
  TAG_CHIP_PREFIX,
  type ActiveFilterState,
} from './active-filters';
import { STATUS_LABELS, TAG_LABELS } from './constants';
import { SORT_LABELS } from './build-feed-query';

const base: ActiveFilterState = {
  zones: ['A', 'B', 'C'],
  totalZones: 3,
  statuses: [],
  tags: [],
  onlyNew: false,
  onlyFavorites: false,
  sort: 'request_newest',
  defaultSort: 'request_newest',
};

describe('buildActiveFilterChips', () => {
  it('returns no chips when nothing is filtered', () => {
    expect(buildActiveFilterChips(base)).toEqual([]);
  });

  it('emits no zone chip when all zones are selected', () => {
    const chips = buildActiveFilterChips({ ...base, zones: ['A', 'B', 'C'] });
    expect(chips.find((c) => c.key === ZONES_CHIP_KEY)).toBeUndefined();
  });

  it('names the single selected zone', () => {
    const chips = buildActiveFilterChips({ ...base, zones: ['Savena'], totalZones: 6 });
    expect(chips).toContainEqual({ key: ZONES_CHIP_KEY, label: 'Savena' });
  });

  it('collapses a multi-zone subset into a count chip', () => {
    const chips = buildActiveFilterChips({ ...base, zones: ['A', 'B'], totalZones: 6 });
    expect(chips).toContainEqual({ key: ZONES_CHIP_KEY, label: '2 quartieri' });
  });

  it('treats a zero-zone selection as an active (0 quartieri) filter', () => {
    const chips = buildActiveFilterChips({ ...base, zones: [], totalZones: 6 });
    expect(chips).toContainEqual({ key: ZONES_CHIP_KEY, label: '0 quartieri' });
  });

  it('maps each status to its label with the status prefix', () => {
    const s = Object.keys(STATUS_LABELS)[0];
    const chips = buildActiveFilterChips({ ...base, statuses: [s] });
    expect(chips).toContainEqual({ key: `${STATUS_CHIP_PREFIX}${s}`, label: STATUS_LABELS[s] });
  });

  it('falls back to the raw status key when unlabeled', () => {
    const chips = buildActiveFilterChips({ ...base, statuses: ['xyz_unknown'] });
    expect(chips).toContainEqual({ key: `${STATUS_CHIP_PREFIX}xyz_unknown`, label: 'xyz_unknown' });
  });

  it('maps each tag to its label with the tag prefix', () => {
    const t = Object.keys(TAG_LABELS)[0];
    const chips = buildActiveFilterChips({ ...base, tags: [t] });
    expect(chips).toContainEqual({ key: `${TAG_CHIP_PREFIX}${t}`, label: TAG_LABELS[t] });
  });

  it('adds only-new and only-favorites chips', () => {
    const chips = buildActiveFilterChips({ ...base, onlyNew: true, onlyFavorites: true });
    expect(chips).toContainEqual({ key: ONLY_NEW_CHIP_KEY, label: 'Solo nuovi' });
    expect(chips).toContainEqual({ key: ONLY_FAVORITES_CHIP_KEY, label: 'Solo salvate' });
  });

  it('adds a sort chip only when sort differs from the default', () => {
    expect(
      buildActiveFilterChips({ ...base, sort: 'request_newest' }).find(
        (c) => c.key === SORT_CHIP_KEY
      )
    ).toBeUndefined();
    const chips = buildActiveFilterChips({ ...base, sort: 'closing_newest' });
    expect(chips).toContainEqual({ key: SORT_CHIP_KEY, label: SORT_LABELS.closing_newest });
  });

  it('orders chips zones → statuses → tags → onlyNew → onlyFavorites → sort', () => {
    const s = Object.keys(STATUS_LABELS)[0];
    const t = Object.keys(TAG_LABELS)[0];
    const chips = buildActiveFilterChips({
      zones: ['A'],
      totalZones: 6,
      statuses: [s],
      tags: [t],
      onlyNew: true,
      onlyFavorites: true,
      sort: 'closing_newest',
      defaultSort: 'request_newest',
    });
    expect(chips.map((c) => c.key)).toEqual([
      ZONES_CHIP_KEY,
      `${STATUS_CHIP_PREFIX}${s}`,
      `${TAG_CHIP_PREFIX}${t}`,
      ONLY_NEW_CHIP_KEY,
      ONLY_FAVORITES_CHIP_KEY,
      SORT_CHIP_KEY,
    ]);
  });
});
