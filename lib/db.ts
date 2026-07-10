import * as SQLite from 'expo-sqlite';
import { createPermitIndexesSql } from './schema-indexes';
import {
  PERMITS_CATEGORY_COLUMN_DDL,
  PERMITS_TITLE_COLUMN_DDL,
  PERMITS_EXTRA_COLUMN_DDL,
  PERMITS_PREVIOUS_STATUS_COLUMN_DDL,
  PERMITS_STATUS_CHANGED_AT_COLUMN_DDL,
  pendingPermitMigrations,
} from './schema-migrations';
import { createFavoritesTableSql } from './favorites';
import { createNotesTableSql } from './notes';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('permits.db');
  await _db.execAsync('PRAGMA journal_mode=WAL;');
  await createTables(_db);
  return _db;
}

async function createTables(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. Create tables (idempotent). Fresh installs get `category` here; existing
  //    installs predate it and pick it up via the ALTER migration below. Indexes
  //    are created LAST (step 3): `idx_permits_category` would fail if run before
  //    the ALTER adds the column on an existing install.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS permits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset TEXT NOT NULL,
      source_id TEXT NOT NULL UNIQUE,
      filing_type TEXT NOT NULL,
      ${PERMITS_CATEGORY_COLUMN_DDL},
      ${PERMITS_TITLE_COLUMN_DDL},
      ${PERMITS_EXTRA_COLUMN_DDL},
      source_updated_at TEXT,
      first_seen_at TEXT NOT NULL,
      address TEXT,
      zone TEXT,
      codvia INTEGER,
      procedimento TEXT,
      date_issued TEXT,
      status TEXT NOT NULL,
      status_raw TEXT,
      ${PERMITS_PREVIOUS_STATUS_COLUMN_DDL},
      ${PERMITS_STATUS_CHANGED_AT_COLUMN_DDL},
      tags TEXT NOT NULL DEFAULT '[]',
      source_link TEXT,
      is_new INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      new_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0
    );

    ${createFavoritesTableSql()}

    ${createNotesTableSql()}
  `);

  // 2. Additive column migrations: diff the live `permits` columns against the
  //    pure migration list and run any pending ALTERs. A failed ALTER propagates
  //    out of getDb() exactly as a failed CREATE TABLE would — no wrapping.
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(permits)');
  for (const sql of pendingPermitMigrations(cols.map((c) => c.name))) {
    await db.execAsync(sql);
  }

  // 3. Secondary indexes (idempotent), after the migration guarantees every
  //    indexed column exists.
  await db.execAsync(createPermitIndexesSql());
}

export async function getPreference(
  db: SQLite.SQLiteDatabase,
  key: string,
  defaultValue: string
): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM preferences WHERE key = ?',
    key
  );
  return row?.value ?? defaultValue;
}

export async function setPreference(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    'INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    value
  );
}
