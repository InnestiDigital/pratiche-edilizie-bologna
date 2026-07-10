import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORY } from './sources';
import {
  PERMITS_CATEGORY_COLUMN,
  PERMITS_CATEGORY_COLUMN_DDL,
  PERMITS_TITLE_COLUMN,
  PERMITS_TITLE_COLUMN_DDL,
  PERMITS_EXTRA_COLUMN,
  PERMITS_EXTRA_COLUMN_DDL,
  PERMITS_PREVIOUS_STATUS_COLUMN,
  PERMITS_PREVIOUS_STATUS_COLUMN_DDL,
  PERMITS_STATUS_CHANGED_AT_COLUMN,
  PERMITS_STATUS_CHANGED_AT_COLUMN_DDL,
  PERMIT_COLUMN_MIGRATIONS,
  pendingPermitMigrations,
} from './schema-migrations';

// The columns a pre-P0 install's `permits` table has (mirrors the original
// db.ts CREATE TABLE before category / title / extra were added).
const PRE_CATEGORY_COLUMNS = [
  'id',
  'dataset',
  'source_id',
  'filing_type',
  'source_updated_at',
  'first_seen_at',
  'address',
  'zone',
  'codvia',
  'procedimento',
  'date_issued',
  'status',
  'status_raw',
  'tags',
  'source_link',
  'is_new',
];

// A pre-P1 install: has the P0 `category` column, still lacks `title` / `extra`.
const PRE_P1_COLUMNS = [...PRE_CATEGORY_COLUMNS, PERMITS_CATEGORY_COLUMN];

// A post-P1 install: has category/title/extra, still lacks the "cosa è cambiato"
// transition columns added later (previous_status / status_changed_at).
const POST_P1_COLUMNS = [...PRE_P1_COLUMNS, PERMITS_TITLE_COLUMN, PERMITS_EXTRA_COLUMN];

// A fully migrated install (every declared column present).
const FULLY_MIGRATED_COLUMNS = [
  ...POST_P1_COLUMNS,
  PERMITS_PREVIOUS_STATUS_COLUMN,
  PERMITS_STATUS_CHANGED_AT_COLUMN,
];

const CATEGORY_ALTER = `ALTER TABLE permits ADD COLUMN ${PERMITS_CATEGORY_COLUMN_DDL};`;
const TITLE_ALTER = `ALTER TABLE permits ADD COLUMN ${PERMITS_TITLE_COLUMN_DDL};`;
const EXTRA_ALTER = `ALTER TABLE permits ADD COLUMN ${PERMITS_EXTRA_COLUMN_DDL};`;
const PREVIOUS_STATUS_ALTER = `ALTER TABLE permits ADD COLUMN ${PERMITS_PREVIOUS_STATUS_COLUMN_DDL};`;
const STATUS_CHANGED_AT_ALTER = `ALTER TABLE permits ADD COLUMN ${PERMITS_STATUS_CHANGED_AT_COLUMN_DDL};`;

describe('pendingPermitMigrations', () => {
  it('returns every ALTER in declaration order for a pre-P0 install', () => {
    const pending = pendingPermitMigrations(PRE_CATEGORY_COLUMNS);
    expect(pending).toEqual([
      CATEGORY_ALTER,
      TITLE_ALTER,
      EXTRA_ALTER,
      PREVIOUS_STATUS_ALTER,
      STATUS_CHANGED_AT_ALTER,
    ]);
  });

  it('returns the title + extra + transition ALTERs (in order) for a pre-P1 install', () => {
    const pending = pendingPermitMigrations(PRE_P1_COLUMNS);
    expect(pending).toEqual([
      TITLE_ALTER,
      EXTRA_ALTER,
      PREVIOUS_STATUS_ALTER,
      STATUS_CHANGED_AT_ALTER,
    ]);
  });

  it('returns only the transition ALTERs for a post-P1 install', () => {
    expect(pendingPermitMigrations(POST_P1_COLUMNS)).toEqual([
      PREVIOUS_STATUS_ALTER,
      STATUS_CHANGED_AT_ALTER,
    ]);
  });

  it('returns [] for a fully migrated install', () => {
    expect(pendingPermitMigrations(FULLY_MIGRATED_COLUMNS)).toEqual([]);
  });

  it('is deterministic in order (matches PERMIT_COLUMN_MIGRATIONS)', () => {
    const pending = pendingPermitMigrations([]);
    expect(pending).toEqual(PERMIT_COLUMN_MIGRATIONS.map((m) => m.sql));
  });

  it('ignores unrelated/irrelevant existing columns', () => {
    const pending = pendingPermitMigrations(['id', 'some_future_column', 'another_one']);
    expect(pending).toEqual(PERMIT_COLUMN_MIGRATIONS.map((m) => m.sql));
  });
});

describe('PERMITS_TITLE_COLUMN_DDL / PERMITS_EXTRA_COLUMN_DDL', () => {
  it('declares title as a nullable TEXT column', () => {
    expect(PERMITS_TITLE_COLUMN_DDL).toBe('title TEXT');
  });

  it("declares extra NOT NULL DEFAULT '{}'", () => {
    expect(PERMITS_EXTRA_COLUMN_DDL).toBe("extra TEXT NOT NULL DEFAULT '{}'");
  });

  it('declares the transition columns as nullable TEXT (backfill-safe)', () => {
    expect(PERMITS_PREVIOUS_STATUS_COLUMN_DDL).toBe('previous_status TEXT');
    expect(PERMITS_STATUS_CHANGED_AT_COLUMN_DDL).toBe('status_changed_at TEXT');
  });
});

describe('PERMIT_COLUMN_MIGRATIONS', () => {
  it('has each migration sql reference its own declared column', () => {
    for (const migration of PERMIT_COLUMN_MIGRATIONS) {
      expect(migration.sql).toContain(`ADD COLUMN ${migration.column}`);
    }
  });

  it('declares no duplicate column names', () => {
    const columns = PERMIT_COLUMN_MIGRATIONS.map((m) => m.column);
    expect(new Set(columns).size).toBe(columns.length);
  });
});

describe('PERMITS_CATEGORY_COLUMN_DDL', () => {
  it("declares NOT NULL DEFAULT 'edilizia'", () => {
    expect(PERMITS_CATEGORY_COLUMN_DDL).toContain("NOT NULL DEFAULT 'edilizia'");
  });

  it('embeds DEFAULT_CATEGORY as the default', () => {
    expect(PERMITS_CATEGORY_COLUMN_DDL).toContain(`DEFAULT '${DEFAULT_CATEGORY}'`);
  });
});
