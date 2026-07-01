import * as SQLite from 'expo-sqlite';
import { createPermitIndexesSql } from './schema-indexes';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('permits.db');
  await _db.execAsync('PRAGMA journal_mode=WAL;');
  await createTables(_db);
  return _db;
}

async function createTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS permits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset TEXT NOT NULL,
      source_id TEXT NOT NULL UNIQUE,
      filing_type TEXT NOT NULL,
      source_updated_at TEXT,
      first_seen_at TEXT NOT NULL,
      address TEXT,
      zone TEXT,
      codvia INTEGER,
      procedimento TEXT,
      date_issued TEXT,
      status TEXT NOT NULL,
      status_raw TEXT,
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

    ${createPermitIndexesSql()}
  `);
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
