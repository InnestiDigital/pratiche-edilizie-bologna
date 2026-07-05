import { DEFAULT_CATEGORY } from './sources';

/**
 * Pure, device-free schema-migration seam for the `permits` table.
 *
 * The repo has no migration framework — `db.ts`'s schema strategy is idempotent
 * `CREATE TABLE / INDEX IF NOT EXISTS` run on every `getDb()`. This module adds the
 * first additive-column migration: it computes which `ALTER TABLE ... ADD COLUMN`
 * statements a given install still needs, given the columns its `permits` table
 * currently has (from `PRAGMA table_info`). `db.ts` stays the thin caller that reads
 * the PRAGMA and executes the returned statements — same build→run split as
 * `schema-indexes.ts` / `db.ts`.
 *
 * Imports nothing from `expo-*`, so it is unit-testable under vitest.
 */

/** The name of the civic-category column added to `permits`. */
export const PERMITS_CATEGORY_COLUMN = 'category';

/**
 * The DDL fragment for the `category` column, shared verbatim by `db.ts`'s
 * `CREATE TABLE` (fresh installs) and the `ALTER TABLE` below (existing installs),
 * so the two schema paths cannot drift. The `NOT NULL DEFAULT` backfills every
 * pre-category row with the (permanently correct) building-permit category.
 */
export const PERMITS_CATEGORY_COLUMN_DDL = `${PERMITS_CATEGORY_COLUMN} TEXT NOT NULL DEFAULT '${DEFAULT_CATEGORY}'`;

/**
 * The name of the headline-title column added to `permits`. Nullable: edilizia
 * rows legitimately have no title (the card falls back to the address), while the
 * four non-edilizia sources store their card headline here so the feed search can
 * `LIKE`-match it in SQL (a promoted column, not a `json_extract` on `extra`).
 */
export const PERMITS_TITLE_COLUMN = 'title';

/**
 * DDL fragment for the `title` column, shared verbatim by `db.ts`'s `CREATE TABLE`
 * (fresh installs) and the `ALTER TABLE` below (existing installs), so the two
 * schema paths cannot drift. Nullable → backfill-safe for pre-existing rows.
 */
export const PERMITS_TITLE_COLUMN_DDL = `${PERMITS_TITLE_COLUMN} TEXT`;

/**
 * The name of the category-specific JSON blob column added to `permits`. Holds the
 * per-category fields the UI reads by key (e.g. cantieri `trafficchangesmeasure`);
 * read on-device through the hardened `permit-extra.ts` decoder, not zod.
 */
export const PERMITS_EXTRA_COLUMN = 'extra';

/**
 * DDL fragment for the `extra` column, shared verbatim between `CREATE TABLE` and
 * the `ALTER TABLE` below. `NOT NULL DEFAULT '{}'` backfills every pre-existing
 * row with an empty object the decoder treats as "no extra data" — bytes and
 * behavior stay identical for edilizia rows (which write `'{}'`).
 */
export const PERMITS_EXTRA_COLUMN_DDL = `${PERMITS_EXTRA_COLUMN} TEXT NOT NULL DEFAULT '{}'`;

/** One additive-column migration on the `permits` table. */
export interface PermitColumnMigration {
  /** The column this migration adds — matched against `PRAGMA table_info`. */
  readonly column: string;
  /** The `ALTER TABLE permits ADD COLUMN ...` statement to run when it's missing. */
  readonly sql: string;
}

/**
 * Every additive column migration for `permits`, in deterministic apply order.
 * A migration runs only if its `column` is absent from the live table.
 */
export const PERMIT_COLUMN_MIGRATIONS: readonly PermitColumnMigration[] = [
  {
    column: PERMITS_CATEGORY_COLUMN,
    sql: `ALTER TABLE permits ADD COLUMN ${PERMITS_CATEGORY_COLUMN_DDL};`,
  },
  {
    column: PERMITS_TITLE_COLUMN,
    sql: `ALTER TABLE permits ADD COLUMN ${PERMITS_TITLE_COLUMN_DDL};`,
  },
  {
    column: PERMITS_EXTRA_COLUMN,
    sql: `ALTER TABLE permits ADD COLUMN ${PERMITS_EXTRA_COLUMN_DDL};`,
  },
];

/**
 * Given the columns the live `permits` table currently has, return the `ALTER TABLE`
 * statements still needed, in declaration order. Fresh installs (column already
 * present via `CREATE TABLE`) get `[]`; a pre-category install gets exactly the
 * `category` ALTER once, then `[]` on every subsequent boot.
 */
export function pendingPermitMigrations(existingColumns: readonly string[]): string[] {
  const have = new Set(existingColumns);
  return PERMIT_COLUMN_MIGRATIONS.filter((m) => !have.has(m.column)).map((m) => m.sql);
}
