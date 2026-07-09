import { describe, it, expect } from 'vitest';
import { MAX_OFFSET } from './paginate';
import {
  distinctCodvia,
  planCiviciFetch,
  MAX_CIVICI_PER_CODVIA,
  CODVIA_BATCH_SIZE,
  type CodviaCarrier,
} from './civici-fetch-plan';

describe('distinctCodvia', () => {
  it('collapses duplicates and sorts ascending', () => {
    const rows: CodviaCarrier[] = [
      { codvia: 350 },
      { codvia: 12 },
      { codvia: 350 },
      { codvia: 47 },
      { codvia: 12 },
    ];
    expect(distinctCodvia(rows)).toEqual([12, 47, 350]);
  });

  it('drops null / non-finite / negative / non-integer codes', () => {
    const rows: CodviaCarrier[] = [
      { codvia: 10 },
      { codvia: null },
      { codvia: Number.NaN },
      { codvia: Number.POSITIVE_INFINITY },
      { codvia: -5 },
      { codvia: 3.5 },
      { codvia: 20 },
    ];
    expect(distinctCodvia(rows)).toEqual([10, 20]);
  });

  it('admits codvia 0 (a valid, non-negative code)', () => {
    expect(distinctCodvia([{ codvia: 0 }, { codvia: 5 }])).toEqual([0, 5]);
  });

  it('returns an empty array for no rows', () => {
    expect(distinctCodvia([])).toEqual([]);
  });
});

describe('planCiviciFetch', () => {
  it('returns no batches for an empty codvia set', () => {
    expect(planCiviciFetch([])).toEqual([]);
  });

  it('folds a small set into one batch with a matching where clause', () => {
    const batches = planCiviciFetch([12, 47, 350]);
    expect(batches).toHaveLength(1);
    expect(batches[0].codvias).toEqual([12, 47, 350]);
    expect(batches[0].where).toBe('codvia in (12, 47, 350)');
  });

  it('splits into chunks of batchSize, keeping a short final batch', () => {
    const codvias = [1, 2, 3, 4, 5];
    const batches = planCiviciFetch(codvias, 2);
    expect(batches.map((b) => b.codvias)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches.map((b) => b.where)).toEqual([
      'codvia in (1, 2)',
      'codvia in (3, 4)',
      'codvia in (5)',
    ]);
  });

  it('covers every code exactly once across the batches (no loss, no dupe)', () => {
    const codvias = Array.from({ length: 100 }, (_, i) => i + 1);
    const batches = planCiviciFetch(codvias);
    expect(batches.flatMap((b) => b.codvias)).toEqual(codvias);
  });

  it('rejects a non-positive or non-integer batchSize', () => {
    expect(() => planCiviciFetch([1], 0)).toThrow(RangeError);
    expect(() => planCiviciFetch([1], -1)).toThrow(RangeError);
    expect(() => planCiviciFetch([1], 2.5)).toThrow(RangeError);
  });
});

describe('cap-safety invariant', () => {
  it('keeps a batch worst-case row count under the ODS offset cap', () => {
    // The whole point of batching: batchSize × the worst-case civici-per-street
    // must stay under MAX_OFFSET so a batch's page walk never truncates.
    expect(CODVIA_BATCH_SIZE * MAX_CIVICI_PER_CODVIA).toBeLessThan(MAX_OFFSET);
    expect(CODVIA_BATCH_SIZE).toBeGreaterThan(0);
  });
});
