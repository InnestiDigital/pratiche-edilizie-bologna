import type * as SQLite from 'expo-sqlite';

/**
 * Personal notes on permits.
 *
 * A user can attach one free-text note to any permit they're tracking (a
 * reminder, a phone call they made, what they're waiting on). Like `favorites`,
 * the note is keyed by the permit's stable **`source_id`** — not the `permits.id`
 * rowid — so it survives a full re-sync that deletes and re-inserts the row with
 * a new `id`, and never binds to the wrong permit. There is no FK to `permits`: a
 * note may outlive a row that drops out of the local window and re-appears later.
 *
 * The DDL is `CREATE TABLE IF NOT EXISTS`, so the already-installed App Store
 * build gains the table on the next `getDb()` with no migration and no data
 * touched — purely additive, exactly like the `favorites` table.
 *
 * The raw editor text is cleaned by `normalizeNote` (see `note-text.ts`) BEFORE
 * it reaches `setNote`; an empty/whitespace note normalizes to `null` and the
 * caller deletes the row instead of storing a blank. So `setNote` only ever
 * receives a non-empty, length-capped string.
 *
 * Native + vitest use this module; the web screenshot build resolves
 * `notes.web.ts` (fixture-backed). Keep the two export surfaces in sync.
 */

/**
 * `CREATE TABLE IF NOT EXISTS` for the notes table. Kept as pure data (like
 * `favorites` / `schema-indexes`) so the schema is unit-testable and `db.ts`
 * composes it into `createTables`. Idempotent — safe to run on every `getDb()`.
 */
export function createNotesTableSql(): string {
  return `CREATE TABLE IF NOT EXISTS permit_notes (
  source_id TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;
}

/** A stored note plus when it was last saved (an ISO timestamp). */
export interface NoteRecord {
  note: string;
  updatedAt: string;
}

/**
 * The stored note for a permit (by `source_id`) together with its `updated_at`
 * timestamp, or `null` when none exists. The detail screen surfaces the timestamp
 * as an "Aggiornata il …" caption so a resident can see how fresh their own note
 * is. `updated_at` is stored (by `setNote`), so no clock is read here.
 */
export async function getNoteRecord(
  db: SQLite.SQLiteDatabase,
  sourceId: string
): Promise<NoteRecord | null> {
  const row = await db.getFirstAsync<{ note: string; updated_at: string }>(
    'SELECT note, updated_at FROM permit_notes WHERE source_id = ?',
    sourceId
  );
  return row ? { note: row.note, updatedAt: row.updated_at } : null;
}

/**
 * Store (insert or replace) a permit's note. `note` must already be a cleaned,
 * non-empty string from `normalizeNote` — an empty note is a delete, not a store,
 * so the caller routes it to `deleteNote`. `updatedAt` is passed in (an ISO
 * timestamp) rather than read from the clock here, so the write is deterministic
 * and unit-testable.
 */
export async function setNote(
  db: SQLite.SQLiteDatabase,
  sourceId: string,
  note: string,
  updatedAt: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO permit_notes (source_id, note, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(source_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    sourceId,
    note,
    updatedAt
  );
}

/** Remove a permit's note (used when the user clears it). Idempotent. */
export async function deleteNote(db: SQLite.SQLiteDatabase, sourceId: string): Promise<void> {
  await db.runAsync('DELETE FROM permit_notes WHERE source_id = ?', sourceId);
}

/**
 * The set of every `source_id` that currently has a note. The feed loads this
 * once per (re)load so each card can render a note indicator from one query
 * instead of a getNote call per visible row — mirrors `listFavoriteIds`. An
 * emptied note is deleted (see `normalizeNote`), so a present row always means a
 * real, non-empty note.
 */
export async function listNotedIds(db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ source_id: string }>('SELECT source_id FROM permit_notes');
  return new Set(rows.map((r) => r.source_id));
}
