/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * Mirrors the public surface of `favorites.ts` but reads a fixed fixture set
 * (`FAVORITE_SOURCE_IDS`) instead of the SQLite `favorites` table, so the web
 * export renders saved-state UI (bookmarked feed cards, the detail "Salvata"
 * button) without a database. Writes are no-ops; `toggleFavorite` reports the
 * flipped state so a tap still animates in the export. The `db` argument is
 * accepted for signature parity and ignored.
 *
 * Native + vitest use `favorites.ts` and never load this file.
 */
import type * as SQLite from 'expo-sqlite';
import { FAVORITE_SOURCE_IDS } from './screenshot-fixtures';

export function createFavoritesTableSql(): string {
  return '';
}

export async function isFavorite(_db: SQLite.SQLiteDatabase, sourceId: string): Promise<boolean> {
  return FAVORITE_SOURCE_IDS.has(sourceId);
}

export async function toggleFavorite(
  _db: SQLite.SQLiteDatabase,
  sourceId: string,
  _savedAt: string
): Promise<boolean> {
  return !FAVORITE_SOURCE_IDS.has(sourceId);
}

export async function listFavoriteIds(_db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  return new Set(FAVORITE_SOURCE_IDS);
}

export async function countFavorites(_db: SQLite.SQLiteDatabase): Promise<number> {
  return FAVORITE_SOURCE_IDS.size;
}
