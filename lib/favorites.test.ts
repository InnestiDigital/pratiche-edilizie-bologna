import { describe, it, expect } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import {
  createFavoritesTableSql,
  isFavorite,
  toggleFavorite,
  listFavoriteIds,
  countFavorites,
} from './favorites';

interface RecordedCall {
  sql: string;
  params: unknown[];
}

/**
 * Fake of the expo-sqlite slice favorites.ts uses. `getFirst` is programmable
 * (and can be a per-call queue) so we can drive the read-then-write branches of
 * `toggleFavorite`; every call is recorded for SQL/param assertions.
 */
function makeFakeDb(results: { getAll?: unknown[]; getFirst?: unknown | unknown[] } = {}) {
  const calls: RecordedCall[] = [];
  const firstQueue = Array.isArray(results.getFirst) ? [...results.getFirst] : null;
  const db = {
    getAllAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return (results.getAll ?? []) as never;
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      if (firstQueue) return (firstQueue.shift() ?? null) as never;
      return (results.getFirst ?? null) as never;
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return { changes: 0, lastInsertRowId: 0 } as never;
    },
  } as unknown as SQLite.SQLiteDatabase;
  return { db, calls };
}

function squish(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('createFavoritesTableSql', () => {
  it('is an idempotent CREATE TABLE keyed by source_id', () => {
    const sql = squish(createFavoritesTableSql());
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS favorites');
    expect(sql).toContain('source_id TEXT PRIMARY KEY');
    expect(sql).toContain('saved_at TEXT NOT NULL');
  });
});

describe('isFavorite', () => {
  it('returns true when a matching row exists', async () => {
    const { db, calls } = makeFakeDb({ getFirst: { c: 1 } });
    expect(await isFavorite(db, 'PDC-2024-000481')).toBe(true);
    expect(squish(calls[0].sql)).toBe('SELECT 1 AS c FROM favorites WHERE source_id = ?');
    expect(calls[0].params).toEqual(['PDC-2024-000481']);
  });

  it('returns false when no row exists', async () => {
    const { db } = makeFakeDb({ getFirst: null });
    expect(await isFavorite(db, 'nope')).toBe(false);
  });
});

describe('toggleFavorite', () => {
  it('inserts (ON CONFLICT DO NOTHING) and returns true when not yet saved', async () => {
    // isFavorite's read returns null → not saved → insert branch.
    const { db, calls } = makeFakeDb({ getFirst: null });
    const now = '2025-01-04T09:12:00.000Z';
    const result = await toggleFavorite(db, 'SCIA-2024-002210', now);
    expect(result).toBe(true);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO favorites'));
    expect(insert).toBeDefined();
    expect(squish(insert!.sql)).toContain('ON CONFLICT(source_id) DO NOTHING');
    expect(insert!.params).toEqual(['SCIA-2024-002210', now]);
  });

  it('deletes and returns false when already saved', async () => {
    const { db, calls } = makeFakeDb({ getFirst: { c: 1 } });
    const result = await toggleFavorite(db, 'SCIA-2024-002210', 'ts');
    expect(result).toBe(false);
    const del = calls.find((c) => c.sql.includes('DELETE FROM favorites'));
    expect(del).toBeDefined();
    expect(del!.params).toEqual(['SCIA-2024-002210']);
    // no insert issued on the delete path
    expect(calls.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });
});

describe('listFavoriteIds', () => {
  it('returns a Set of every stored source_id', async () => {
    const { db } = makeFakeDb({
      getAll: [{ source_id: 'a' }, { source_id: 'b' }, { source_id: 'a' }],
    });
    const ids = await listFavoriteIds(db);
    expect(ids).toBeInstanceOf(Set);
    expect([...ids].sort()).toEqual(['a', 'b']);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('c')).toBe(false);
  });

  it('returns an empty Set when nothing is saved', async () => {
    const { db } = makeFakeDb({ getAll: [] });
    expect((await listFavoriteIds(db)).size).toBe(0);
  });
});

describe('countFavorites', () => {
  it('returns the COUNT(*) value', async () => {
    const { db, calls } = makeFakeDb({ getFirst: { c: 7 } });
    expect(await countFavorites(db)).toBe(7);
    expect(squish(calls[0].sql)).toBe('SELECT COUNT(*) AS c FROM favorites');
  });

  it('defaults to 0 when the count row is missing', async () => {
    const { db } = makeFakeDb({ getFirst: null });
    expect(await countFavorites(db)).toBe(0);
  });
});
