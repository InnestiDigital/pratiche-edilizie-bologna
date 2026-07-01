import { describe, it, expect } from 'vitest';
import { summarizeSyncResults } from './background-result';
import type { SyncResult } from './sync';

function res(partial: Partial<SyncResult>): SyncResult {
  return {
    dataset: 'pdc',
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
      hasChanges: false,
    });
  });

  it('reports no changes when every dataset inserted/updated nothing', () => {
    const s = summarizeSyncResults([
      res({ dataset: 'pdc' }),
      res({ dataset: 'scia' }),
      res({ dataset: 'cila' }),
    ]);
    expect(s).toEqual({ totalNew: 0, totalUpdated: 0, hasChanges: false });
  });

  it('sums insert and update counts across datasets', () => {
    const s = summarizeSyncResults([
      res({ dataset: 'pdc', inserted: 3, updated: 1 }),
      res({ dataset: 'scia', inserted: 2, updated: 4 }),
      res({ dataset: 'cila', inserted: 0, updated: 5 }),
    ]);
    expect(s).toEqual({ totalNew: 5, totalUpdated: 10, hasChanges: true });
  });

  it('flags changes when only new permits arrived', () => {
    const s = summarizeSyncResults([res({ inserted: 1 })]);
    expect(s).toEqual({ totalNew: 1, totalUpdated: 0, hasChanges: true });
  });

  it('flags changes when only updates arrived', () => {
    const s = summarizeSyncResults([res({ updated: 1 })]);
    expect(s).toEqual({ totalNew: 0, totalUpdated: 1, hasChanges: true });
  });

  it('ignores per-dataset error results that contributed no counts', () => {
    const s = summarizeSyncResults([
      res({ dataset: 'pdc', inserted: 2 }),
      res({ dataset: 'scia', inserted: 0, updated: 0, error: 'timeout' }),
    ]);
    expect(s).toEqual({ totalNew: 2, totalUpdated: 0, hasChanges: true });
  });

  describe('malformed counts cannot inflate or spuriously trigger notifications', () => {
    it('treats negative counts as zero', () => {
      const s = summarizeSyncResults([res({ inserted: -5, updated: -2 })]);
      expect(s).toEqual({ totalNew: 0, totalUpdated: 0, hasChanges: false });
    });

    it('treats NaN counts as zero', () => {
      const s = summarizeSyncResults([res({ inserted: NaN, updated: NaN })]);
      expect(s).toEqual({ totalNew: 0, totalUpdated: 0, hasChanges: false });
    });

    it('treats Infinity counts as zero', () => {
      const s = summarizeSyncResults([res({ inserted: Infinity })]);
      expect(s).toEqual({ totalNew: 0, totalUpdated: 0, hasChanges: false });
    });

    it('floors fractional counts', () => {
      const s = summarizeSyncResults([res({ inserted: 2.9, updated: 1.1 })]);
      expect(s).toEqual({ totalNew: 2, totalUpdated: 1, hasChanges: true });
    });

    it('drops a bad count but keeps valid ones in the same pass', () => {
      const s = summarizeSyncResults([
        res({ dataset: 'pdc', inserted: -1, updated: 3 }),
        res({ dataset: 'scia', inserted: 4, updated: NaN }),
      ]);
      expect(s).toEqual({ totalNew: 4, totalUpdated: 3, hasChanges: true });
    });
  });
});
