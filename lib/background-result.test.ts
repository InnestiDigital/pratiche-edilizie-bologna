import { describe, it, expect } from 'vitest';
import { summarizeSyncResults } from './background-result';
import type { SyncResult } from './sync';

function res(partial: Partial<SyncResult>): SyncResult {
  return {
    dataset: 'pdc',
    category: 'edilizia',
    fetched: 0,
    inserted: 0,
    updated: 0,
    ...partial,
  };
}

describe('summarizeSyncResults', () => {
  it('returns all-zero, no-changes for an empty pass', () => {
    expect(summarizeSyncResults([])).toEqual({
      totalNew: 0,
      totalUpdated: 0,
      newByCategory: {},
      hasChanges: false,
    });
  });

  it('reports no changes when every source inserted/updated nothing', () => {
    const s = summarizeSyncResults([
      res({ dataset: 'pdc' }),
      res({ dataset: 'scia' }),
      res({ dataset: 'cila' }),
    ]);
    expect(s).toEqual({ totalNew: 0, totalUpdated: 0, newByCategory: {}, hasChanges: false });
  });

  it('sums insert and update counts across sources', () => {
    const s = summarizeSyncResults([
      res({ dataset: 'pdc', inserted: 3, updated: 1 }),
      res({ dataset: 'scia', inserted: 2, updated: 4 }),
      res({ dataset: 'cila', inserted: 0, updated: 5 }),
    ]);
    expect(s).toEqual({
      totalNew: 5,
      totalUpdated: 10,
      newByCategory: { edilizia: 5 },
      hasChanges: true,
    });
  });

  it('flags changes when only new permits arrived', () => {
    const s = summarizeSyncResults([res({ inserted: 1 })]);
    expect(s).toEqual({
      totalNew: 1,
      totalUpdated: 0,
      newByCategory: { edilizia: 1 },
      hasChanges: true,
    });
  });

  it('flags changes when only updates arrived', () => {
    const s = summarizeSyncResults([res({ updated: 1 })]);
    expect(s).toEqual({
      totalNew: 0,
      totalUpdated: 1,
      newByCategory: {},
      hasChanges: true,
    });
  });

  it('ignores per-source error results that contributed no counts', () => {
    const s = summarizeSyncResults([
      res({ dataset: 'pdc', inserted: 2 }),
      res({ dataset: 'scia', inserted: 0, updated: 0, error: 'timeout' }),
    ]);
    expect(s).toEqual({
      totalNew: 2,
      totalUpdated: 0,
      newByCategory: { edilizia: 2 },
      hasChanges: true,
    });
  });

  describe('per-category new-permit breakdown', () => {
    it('groups new counts by category and sums same-category sources', () => {
      const s = summarizeSyncResults([
        res({ dataset: 'pdc', category: 'edilizia', inserted: 3 }),
        res({ dataset: 'cila', category: 'edilizia', inserted: 2 }),
        res({ dataset: 'lavori', category: 'cantieri', inserted: 4 }),
        res({ dataset: 'eventi', category: 'eventi', inserted: 5 }),
      ]);
      expect(s.newByCategory).toEqual({ edilizia: 5, cantieri: 4, eventi: 5 });
      expect(s.totalNew).toBe(14);
    });

    it('omits categories whose only contribution is updates (not new)', () => {
      const s = summarizeSyncResults([
        res({ dataset: 'commercio', category: 'commercio', inserted: 0, updated: 6 }),
      ]);
      expect(s.newByCategory).toEqual({});
      expect(s.totalUpdated).toBe(6);
    });

    it('folds an unrecognized category into totals but not newByCategory', () => {
      const s = summarizeSyncResults([
        // A malformed result with a category outside the union.
        res({ dataset: 'mystery', category: 'mobilita' as never, inserted: 7 }),
        res({ dataset: 'pdc', category: 'edilizia', inserted: 2 }),
      ]);
      expect(s.totalNew).toBe(9);
      expect(s.newByCategory).toEqual({ edilizia: 2 });
      expect(s.hasChanges).toBe(true);
    });
  });

  describe('malformed counts cannot inflate or spuriously trigger notifications', () => {
    it('treats negative counts as zero', () => {
      const s = summarizeSyncResults([res({ inserted: -5, updated: -2 })]);
      expect(s).toEqual({ totalNew: 0, totalUpdated: 0, newByCategory: {}, hasChanges: false });
    });

    it('treats NaN counts as zero', () => {
      const s = summarizeSyncResults([res({ inserted: NaN, updated: NaN })]);
      expect(s).toEqual({ totalNew: 0, totalUpdated: 0, newByCategory: {}, hasChanges: false });
    });

    it('treats Infinity counts as zero', () => {
      const s = summarizeSyncResults([res({ inserted: Infinity })]);
      expect(s).toEqual({ totalNew: 0, totalUpdated: 0, newByCategory: {}, hasChanges: false });
    });

    it('floors fractional counts', () => {
      const s = summarizeSyncResults([res({ inserted: 2.9, updated: 1.1 })]);
      expect(s).toEqual({
        totalNew: 2,
        totalUpdated: 1,
        newByCategory: { edilizia: 2 },
        hasChanges: true,
      });
    });

    it('drops a bad count but keeps valid ones in the same pass', () => {
      const s = summarizeSyncResults([
        res({ dataset: 'pdc', inserted: -1, updated: 3 }),
        res({ dataset: 'scia', inserted: 4, updated: NaN }),
      ]);
      expect(s).toEqual({
        totalNew: 4,
        totalUpdated: 3,
        newByCategory: { edilizia: 4 },
        hasChanges: true,
      });
    });
  });
});
