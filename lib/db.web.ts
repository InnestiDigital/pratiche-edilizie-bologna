/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * The real `db.ts` imports `expo-sqlite`, whose web build pulls a wasm worker
 * (`wa-sqlite.wasm`) that does not resolve under a plain `expo export --platform
 * web`, breaking the whole web bundle. For the screenshot build we never touch a
 * database: `queries.web.ts` / `preferences.web.ts` return fixtures directly, so
 * this shim only needs to satisfy the `getDb()` call sites (screens fetch a db
 * handle and hand it to the query fns, which ignore it here).
 *
 * Native (iOS/Android) and the vitest suite use `db.ts` and never load this file.
 */
import type * as SQLite from 'expo-sqlite';

// Documented boundary assertion: the returned handle is never used on web — the
// web query/preference shims ignore their `db` argument. This is the one place a
// `as unknown as` is justified (a screenshot-only FFI stand-in).
const NOOP_DB = {} as unknown as SQLite.SQLiteDatabase;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  return NOOP_DB;
}

export async function getPreference(
  _db: SQLite.SQLiteDatabase,
  _key: string,
  defaultValue: string
): Promise<string> {
  return defaultValue;
}

export async function setPreference(
  _db: SQLite.SQLiteDatabase,
  _key: string,
  _value: string
): Promise<void> {
  // no-op on web
}
