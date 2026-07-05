import { describe, it, expect } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import { createNotesTableSql, getNoteRecord, setNote, deleteNote, listNotePreviews } from './notes';

interface RecordedCall {
  sql: string;
  params: unknown[];
}

/** Fake of the expo-sqlite slice notes.ts uses; records every call. */
function makeFakeDb(results: { getFirst?: unknown; getAll?: unknown[] } = {}) {
  const calls: RecordedCall[] = [];
  const db = {
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return (results.getFirst ?? null) as never;
    },
    getAllAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return (results.getAll ?? []) as never;
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

describe('getNoteRecord', () => {
  it('returns the stored note text + updated_at timestamp when a row exists', async () => {
    const { db, calls } = makeFakeDb({
      getFirst: { note: 'ho chiamato', updated_at: '2024-11-18T09:30:00.000Z' },
    });
    expect(await getNoteRecord(db, 'PDC-2024-000481')).toEqual({
      note: 'ho chiamato',
      updatedAt: '2024-11-18T09:30:00.000Z',
    });
    expect(squish(calls[0].sql)).toBe(
      'SELECT note, updated_at FROM permit_notes WHERE source_id = ?'
    );
    expect(calls[0].params).toEqual(['PDC-2024-000481']);
  });

  it('returns null when no row exists', async () => {
    const { db } = makeFakeDb({ getFirst: null });
    expect(await getNoteRecord(db, 'nope')).toBeNull();
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

describe('listNotePreviews', () => {
  it('maps every annotated source_id to a one-line preview of its note', async () => {
    const { db, calls } = makeFakeDb({
      getAll: [
        { source_id: 'PDC-2024-000481', note: 'Richiamare\ndopo il 15' },
        { source_id: 'SCIA-2024-002210', note: 'In attesa risposta' },
      ],
    });
    const previews = await listNotePreviews(db);
    expect(squish(calls[0].sql)).toBe('SELECT source_id, note FROM permit_notes');
    expect(previews).toEqual(
      new Map([
        ['PDC-2024-000481', 'Richiamare dopo il 15'],
        ['SCIA-2024-002210', 'In attesa risposta'],
      ])
    );
    // still usable as the annotated-set membership/size the feed relies on
    expect(previews.has('PDC-2024-000481')).toBe(true);
    expect(previews.size).toBe(2);
  });

  it('returns an empty map when no permit is annotated', async () => {
    const { db } = makeFakeDb({ getAll: [] });
    expect(await listNotePreviews(db)).toEqual(new Map());
  });
});
