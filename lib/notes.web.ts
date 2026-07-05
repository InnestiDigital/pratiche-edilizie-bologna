/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * Mirrors the public surface of `notes.ts` but reads a fixed fixture
 * (`NOTE_FIXTURES`) instead of the SQLite `permit_notes` table, so the web export
 * renders the detail "Le mie note" card populated without a database. Writes are
 * no-ops. The `db` argument is accepted for signature parity and ignored.
 *
 * Native + vitest use `notes.ts` and never load this file.
 */
import type * as SQLite from 'expo-sqlite';
import { NOTE_FIXTURES } from './screenshot-fixtures';
import type { NoteRecord } from './notes';
import { notePreview } from './note-preview';

export function createNotesTableSql(): string {
  return '';
}

export async function getNoteRecord(
  _db: SQLite.SQLiteDatabase,
  sourceId: string
): Promise<NoteRecord | null> {
  return NOTE_FIXTURES[sourceId] ?? null;
}

export async function setNote(
  _db: SQLite.SQLiteDatabase,
  _sourceId: string,
  _note: string,
  _updatedAt: string
): Promise<void> {
  // no-op in the screenshot build
}

export async function deleteNote(_db: SQLite.SQLiteDatabase, _sourceId: string): Promise<void> {
  // no-op in the screenshot build
}

export async function listNotePreviews(_db: SQLite.SQLiteDatabase): Promise<Map<string, string>> {
  return new Map(Object.entries(NOTE_FIXTURES).map(([id, rec]) => [id, notePreview(rec.note)]));
}
