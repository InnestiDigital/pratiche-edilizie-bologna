import { describe, it, expect } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import { createNotesTableSql, getNote, setNote, deleteNote } from './notes';

interface RecordedCall {
  sql: string;
  params: unknown[];
}

/** Fake of the expo-sqlite slice notes.ts uses; records every call. */
function makeFakeDb(results: { getFirst?: unknown } = {}) {
  const calls: RecordedCall[] = [];
  const db = {
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
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

describe('createNotesTableSql', () => {
  it('is an idempotent CREATE TABLE keyed by source_id', () => {
    const sql = squish(createNotesTableSql());
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS permit_notes');
    expect(sql).toContain('source_id TEXT PRIMARY KEY');
    expect(sql).toContain('note TEXT NOT NULL');
    expect(sql).toContain('updated_at TEXT NOT NULL');
  });
});

describe('getNote', () => {
  it('returns the stored note text when a row exists', async () => {
    const { db, calls } = makeFakeDb({ getFirst: { note: 'ho chiamato' } });
    expect(await getNote(db, 'PDC-2024-000481')).toBe('ho chiamato');
    expect(squish(calls[0].sql)).toBe('SELECT note FROM permit_notes WHERE source_id = ?');
    expect(calls[0].params).toEqual(['PDC-2024-000481']);
  });

  it('returns null when no row exists', async () => {
    const { db } = makeFakeDb({ getFirst: null });
    expect(await getNote(db, 'nope')).toBeNull();
  });
});

describe('setNote', () => {
  it('upserts note + updated_at keyed by source_id', async () => {
    const { db, calls } = makeFakeDb();
    const now = '2025-01-04T09:12:00.000Z';
    await setNote(db, 'SCIA-2024-002210', 'in attesa risposta', now);
    const call = calls.find((c) => c.sql.includes('INSERT INTO permit_notes'));
    expect(call).toBeDefined();
    expect(squish(call!.sql)).toContain('ON CONFLICT(source_id) DO UPDATE SET');
    expect(squish(call!.sql)).toContain('note = excluded.note');
    expect(squish(call!.sql)).toContain('updated_at = excluded.updated_at');
    expect(call!.params).toEqual(['SCIA-2024-002210', 'in attesa risposta', now]);
  });
});

describe('deleteNote', () => {
  it('deletes the note row for a source_id', async () => {
    const { db, calls } = makeFakeDb();
    await deleteNote(db, 'CILA-2024-005567');
    expect(squish(calls[0].sql)).toBe('DELETE FROM permit_notes WHERE source_id = ?');
    expect(calls[0].params).toEqual(['CILA-2024-005567']);
  });
});
