import { describe, it, expect } from 'vitest';
import {
  effectiveFeedCategories,
  effectiveFilingTypes,
  showFilingSubRow,
  categoryChoices,
  showCategoryRow,
} from './feed-category';
import { FILING_TYPE_ORDER, type FilingType } from './constants';
import { CATEGORIES, type Category } from './sources';

const ALL: Category[] = [...CATEGORIES];
const ALL_TYPES: FilingType[] = [...FILING_TYPE_ORDER];

describe('effectiveFeedCategories', () => {
  it('returns all followed when nothing is selected', () => {
    expect(effectiveFeedCategories(null, ['edilizia', 'eventi'])).toEqual(['edilizia', 'eventi']);
  });

  it('narrows to the single selected category when it is followed', () => {
    expect(effectiveFeedCategories('eventi', ['edilizia', 'eventi', 'segnalazioni'])).toEqual([
      'eventi',
    ]);
  });

  it('falls back to all followed when the selection was unfollowed (orphaned), never empty', () => {
    // User picked Eventi, then unfollowed it in Settings — the feed must not
    // filter to an empty, un-clearable state.
    expect(effectiveFeedCategories('eventi', ['edilizia', 'cantieri'])).toEqual([
      'edilizia',
      'cantieri',
    ]);
  });

  it('passes the empty followed set straight through (no data / all unfollowed)', () => {
    expect(effectiveFeedCategories('eventi', [])).toEqual([]);
    expect(effectiveFeedCategories(null, [])).toEqual([]);
  });
});

describe('showFilingSubRow', () => {
  it('shows the PDC/SCIA/CILA sub-row only when scoped to edilizia alone', () => {
    expect(showFilingSubRow(['edilizia'])).toBe(true);
  });

  it('hides the sub-row when the feed mixes categories', () => {
    expect(showFilingSubRow(['edilizia', 'eventi'])).toBe(false);
  });

  it('hides the sub-row for a non-edilizia single category', () => {
    expect(showFilingSubRow(['eventi'])).toBe(false);
    expect(showFilingSubRow(['cantieri'])).toBe(false);
  });

  it('hides the sub-row when nothing is in scope', () => {
    expect(showFilingSubRow([])).toBe(false);
  });

  it('composes with effectiveFeedCategories: edilizia-only follower keeps the filing row', () => {
    expect(showFilingSubRow(effectiveFeedCategories(null, ['edilizia']))).toBe(true);
  });

  it('composes: selecting edilizia in a mixed follower re-shows the filing row', () => {
    expect(showFilingSubRow(effectiveFeedCategories('edilizia', ['edilizia', 'eventi']))).toBe(
      true
    );
  });

  it('composes: selecting eventi in a mixed follower hides the filing row', () => {
    expect(showFilingSubRow(effectiveFeedCategories('eventi', ['edilizia', 'eventi']))).toBe(false);
  });
});

describe('effectiveFilingTypes', () => {
  it('applies the active PDC/SCIA/CILA selection when scoped to edilizia alone', () => {
    expect(effectiveFilingTypes(['PDC'], ALL_TYPES, ['edilizia'])).toEqual(['PDC']);
  });

  it('keeps every followed type when the full set is active under edilizia scope', () => {
    expect(effectiveFilingTypes(ALL_TYPES, ALL_TYPES, ['edilizia'])).toEqual(ALL_TYPES);
  });

  it('falls back to the full followed set out of edilizia-alone scope (mixed feed)', () => {
    // The bug guard: a narrowed {PDC} selection would otherwise silently drop
    // edilizia SCIA/CILA rows in a mixed feed with the chip row hidden.
    expect(effectiveFilingTypes(['PDC'], ALL_TYPES, ['edilizia', 'eventi'])).toEqual(ALL_TYPES);
  });

  it('falls back to the full followed set for a non-edilizia single category', () => {
    expect(effectiveFilingTypes(['PDC'], ALL_TYPES, ['cantieri'])).toEqual(ALL_TYPES);
    expect(effectiveFilingTypes(['SCIA'], ALL_TYPES, ['eventi'])).toEqual(ALL_TYPES);
  });

  it('intersects the active selection with the preferred set under edilizia scope', () => {
    // A followed-set narrower than the active selection wins (user follows only PDC/SCIA).
    expect(effectiveFilingTypes(['PDC', 'CILA'], ['PDC', 'SCIA'], ['edilizia'])).toEqual(['PDC']);
  });

  it('composes with effectiveFeedCategories: leaving edilizia scope drops the filter', () => {
    const mixed = effectiveFeedCategories(null, ['edilizia', 'eventi']);
    expect(effectiveFilingTypes(['PDC'], ALL_TYPES, mixed)).toEqual(ALL_TYPES);
    const edOnly = effectiveFeedCategories('edilizia', ['edilizia', 'eventi']);
    expect(effectiveFilingTypes(['PDC'], ALL_TYPES, edOnly)).toEqual(['PDC']);
  });
});

describe('categoryChoices', () => {
  it('lists followed categories in canonical registry order, not prefs order', () => {
    // Followed set given out of registry order — output still follows CATEGORIES.
    expect(categoryChoices(['eventi', 'edilizia', 'cantieri'])).toEqual([
      'edilizia',
      'cantieri',
      'eventi',
    ]);
  });

  it('excludes unfollowed categories', () => {
    expect(categoryChoices(['edilizia', 'segnalazioni'])).toEqual(['edilizia', 'segnalazioni']);
  });

  it('returns every category (registry order) when all are followed', () => {
    expect(categoryChoices(ALL)).toEqual(ALL);
  });

  it('returns empty for an empty followed set', () => {
    expect(categoryChoices([])).toEqual([]);
  });
});

describe('showCategoryRow', () => {
  it('shows the row when two or more categories are followed', () => {
    expect(showCategoryRow(['edilizia', 'eventi'])).toBe(true);
    expect(showCategoryRow(ALL)).toBe(true);
  });

  it('hides the row for a single followed category (nothing to switch between)', () => {
    expect(showCategoryRow(['edilizia'])).toBe(false);
    expect(showCategoryRow(['eventi'])).toBe(false);
  });

  it('hides the row when nothing is followed', () => {
    expect(showCategoryRow([])).toBe(false);
  });
});
