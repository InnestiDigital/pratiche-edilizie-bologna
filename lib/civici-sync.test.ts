import { describe, it, expect } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import { backfillEdiliziaCoords, type CiviciBatchFetcher } from './civici-sync';
import { decodeExtra } from './permit-extra';
import type { EdiliziaBackfillRow } from './civici-backfill';
import type { CiviciRecord } from './geocode-civici';

/**
 * Fake of the slice of the expo-sqlite API the civici back-fill glue uses:
 * `getAllAsync` returns the programmed edilizia rows, `withTransactionAsync` runs
 * its callback inline, and `runAsync` records each applied UPDATE so a test can
 * assert exactly which rows were written and with what merged `extra`. No native
 * SQLite engine is involved — this is the injected effect the orchestration is
 * tested against.
 */
interface AppliedUpdate {
  sql: string;
  params: unknown[];
}

function makeFakeDb(rows: EdiliziaBackfillRow[]) {
  const updates: AppliedUpdate[] = [];
  let transactions = 0;
  const db = {
    getAllAsync: async () => rows as never,
    withTransactionAsync: async (fn: () => Promise<void>) => {
      transactions++;
      await fn();
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      updates.push({ sql, params });
      return { changes: 1, lastInsertRowId: 0 } as never;
    },
  } as unknown as SQLite.SQLiteDatabase;
  return { db, updates, txCount: () => transactions };
}

/** A batch fetcher that returns a fixed record set and counts its invocations. */
function makeFetcher(records: CiviciRecord[]) {
  const wheres: string[] = [];
  const fetchBatch: CiviciBatchFetcher = async (where) => {
    wheres.push(where);
    return records;
  };
  return { fetchBatch, wheres };
}

function edilizia(source_id: string, codvia: number | null, civico?: number): EdiliziaBackfillRow {
  return {
    source_id,
    codvia,
    extra: JSON.stringify(civico != null ? { civico: String(civico) } : {}),
  };
}

describe('backfillEdiliziaCoords', () => {
  it('does nothing (no fetch, no write) when there are no coordinate-less rows', async () => {
    const { db, updates } = makeFakeDb([]);
    const { fetchBatch, wheres } = makeFetcher([]);

    const summary = await backfillEdiliziaCoords(db, fetchBatch);

    expect(summary).toEqual({
      candidates: 0,
      fetched: 0,
      geocoded: 0,
      alreadyCoded: 0,
      unresolved: 0,
    });
    expect(wheres).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('geocodes rows against the fetched gazetteer and writes the merged extra', async () => {
    const rows = [edilizia('a', 10, 5), edilizia('b', 20, 7)];
    const records: CiviciRecord[] = [
      { codvia: 10, civico: 5, lat: 44.5, lon: 11.3 },
      { codvia: 20, civico: 7, lat: 44.6, lon: 11.4 },
    ];
    const { db, updates, txCount } = makeFakeDb(rows);
    const { fetchBatch, wheres } = makeFetcher(records);

    const summary = await backfillEdiliziaCoords(db, fetchBatch);

    expect(summary.candidates).toBe(2);
    expect(summary.fetched).toBe(2);
    expect(summary.geocoded).toBe(2);
    expect(summary.unresolved).toBe(0);

    // Both distinct streets scoped into a (single, cap-safe) batch fetch.
    expect(wheres).toHaveLength(1);
    expect(wheres[0]).toContain('codvia in (10, 20)');

    // Two UPDATEs, applied inside one transaction, each merging lat/lon while
    // preserving the existing civico key.
    expect(txCount()).toBe(1);
    expect(updates).toHaveLength(2);
    const byId = new Map(updates.map((u) => [u.params[1] as string, u.params[0] as string]));
    expect(decodeExtra(byId.get('a')!)).toEqual({ civico: '5', lat: '44.5', lon: '11.3' });
    expect(decodeExtra(byId.get('b')!)).toEqual({ civico: '7', lat: '44.6', lon: '11.4' });
  });

  it('counts rows whose street is absent from the gazetteer as unresolved and writes nothing', async () => {
    const rows = [edilizia('a', 999, 3)];
    const { db, updates } = makeFakeDb(rows);
    // Gazetteer has a different street → no match, exact nor centroid.
    const { fetchBatch } = makeFetcher([{ codvia: 10, civico: 5, lat: 44.5, lon: 11.3 }]);

    const summary = await backfillEdiliziaCoords(db, fetchBatch);

    expect(summary.geocoded).toBe(0);
    expect(summary.unresolved).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('falls back to the street centroid when the exact civico is missing', async () => {
    const rows = [edilizia('a', 10)]; // no civico
    const records: CiviciRecord[] = [
      { codvia: 10, civico: 2, lat: 44.4, lon: 11.2 },
      { codvia: 10, civico: 4, lat: 44.6, lon: 11.4 },
    ];
    const { db, updates } = makeFakeDb(rows);
    const { fetchBatch } = makeFetcher(records);

    const summary = await backfillEdiliziaCoords(db, fetchBatch);

    expect(summary.geocoded).toBe(1);
    const coords = decodeExtra(updates[0].params[0] as string);
    // Mean of the two street points (street-level centroid fallback).
    expect(Number(coords.lat)).toBeCloseTo(44.5, 10);
    expect(Number(coords.lon)).toBeCloseTo(11.3, 10);
  });

  it('returns early with no fetch when rows carry no valid street code', async () => {
    const rows = [edilizia('a', null, 5)];
    const { db, updates } = makeFakeDb(rows);
    const { fetchBatch, wheres } = makeFetcher([]);

    const summary = await backfillEdiliziaCoords(db, fetchBatch);

    expect(summary).toEqual({
      candidates: 1,
      fetched: 0,
      geocoded: 0,
      alreadyCoded: 0,
      unresolved: 1,
    });
    expect(wheres).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
