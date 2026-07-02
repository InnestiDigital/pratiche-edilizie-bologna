import type * as SQLite from 'expo-sqlite';

/**
 * Saved permits ("preferiti" / bookmarks).
 *
 * A user can save any permit to follow it later; saved permits get a bookmark on
 * their feed card and a "Solo salvate" feed filter. The set is stored in its own
 * `favorites` table keyed by the permit's **`source_id`** — the stable, UNIQUE
 * business key `normalize.ts` derives — rather than the `permits.id` rowid. That
 * matters: a full re-sync can delete and re-insert a permit row (new `id`), but
 * its `source_id` is stable, so a save survives re-syncs and never silently binds
 * to the wrong permit. The table has no FK to `permits`: a save may outlive a row
 * that later drops out of the local window and re-appears on a future sync.
 *
 * The DDL is `CREATE TABLE IF NOT EXISTS`, so an already-installed app (the live
 * App Store build) gains the table on the next `getDb()` with **no migration and
 * no data touched** — purely additive.
 *
 * Native + vitest use this module; the web screenshot build resolves
 * `favorites.web.ts` (fixture-backed). Keep the two export surfaces in sync.
 */

/**
 * `CREATE TABLE IF NOT EXISTS` for the favorites table. Kept as pure data (like
 * `schema-indexes`) so the schema is unit-testable and `db.ts` composes it into
 * `createTables`. Idempotent — safe to run on every `getDb()`.
 */
export function createFavoritesTableSql(): string {
  return `CREATE TABLE IF NOT EXISTS favorites (
  source_id TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL
);`;
}

/** Whether the given permit (by `source_id`) is currently saved. */
export async function isFavorite(db: SQLite.SQLiteDatabase, sourceId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT 1 AS c FROM favorites WHERE source_id = ?',
    sourceId
  );
  return row != null;
}

/**
 * Toggle a permit's saved state and return the resulting state (`true` = now
 * saved). Save uses `ON CONFLICT DO NOTHING` so a double-tap is idempotent and
 * never overwrites the original `saved_at`. `savedAt` is passed in (an ISO
 * timestamp) rather than read from the clock here, so the write is deterministic
 * and unit-testable.
 */
export async function toggleFavorite(
  db: SQLite.SQLiteDatabase,
  sourceId: string,
  savedAt: string
): Promise<boolean> {
  if (await isFavorite(db, sourceId)) {
    await db.runAsync('DELETE FROM favorites WHERE source_id = ?', sourceId);
    return false;
  }
  await db.runAsync(
    'INSERT INTO favorites (source_id, saved_at) VALUES (?, ?) ON CONFLICT(source_id) DO NOTHING',
    sourceId,
    savedAt
  );
  return true;
}

/**
 * The set of every saved `source_id`. The feed loads this once per (re)load and
 * marks each card's bookmark from it — a single query instead of one `isFavorite`
 * call per visible row.
 */
export async function listFavoriteIds(db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ source_id: string }>('SELECT source_id FROM favorites');
  return new Set(rows.map((r) => r.source_id));
}

/** How many permits are saved. */
export async function countFavorites(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM favorites');
  return row?.c ?? 0;
}
