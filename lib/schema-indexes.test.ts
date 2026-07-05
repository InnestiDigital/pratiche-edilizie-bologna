import { describe, it, expect } from 'vitest';
import { PERMIT_INDEX_SPECS, createPermitIndexesSql } from './schema-indexes';

// The columns the permits table actually has (mirrors db.ts createTables). An index
// on a column that doesn't exist would fail at CREATE INDEX time on-device but pass
// tsc/lint, so guard it here.
const PERMIT_COLUMNS = new Set([
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
  'category',
]);

describe('PERMIT_INDEX_SPECS', () => {
  it('has unique index names', () => {
    const names = PERMIT_INDEX_SPECS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only indexes real permits columns', () => {
    for (const idx of PERMIT_INDEX_SPECS) {
      expect(PERMIT_COLUMNS.has(idx.column), `${idx.name} → ${idx.column}`).toBe(true);
    }
  });

  it('uses the idx_permits_ naming convention', () => {
    for (const idx of PERMIT_INDEX_SPECS) {
      expect(idx.name.startsWith('idx_permits_')).toBe(true);
    }
  });

  // Perf contract: every feed ORDER BY column (build-feed-query SORT_SQL) must be
  // indexed so infinite-scroll pagination is an index-ordered scan, not a full-table
  // sort per page. `id` is the rowid alias, so a single-column index on the sort
  // column serves the composite `col, id` order (see schema-indexes.ts).
  it('indexes every feed sort column', () => {
    const indexed = new Set(PERMIT_INDEX_SPECS.map((i) => i.column));
    for (const sortColumn of ['first_seen_at', 'source_updated_at', 'date_issued']) {
      expect(indexed.has(sortColumn), `sort column ${sortColumn} must be indexed`).toBe(true);
    }
  });

  it('indexes every feed filter column', () => {
    const indexed = new Set(PERMIT_INDEX_SPECS.map((i) => i.column));
    for (const filterColumn of ['zone', 'filing_type']) {
      expect(indexed.has(filterColumn), `filter column ${filterColumn} must be indexed`).toBe(true);
    }
  });
});

describe('createPermitIndexesSql', () => {
  it('emits one idempotent CREATE INDEX per spec', () => {
    const sql = createPermitIndexesSql();
    const lines = sql.split('\n').filter(Boolean);
    expect(lines).toHaveLength(PERMIT_INDEX_SPECS.length);
    for (const idx of PERMIT_INDEX_SPECS) {
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${idx.name} ON permits(${idx.column});`);
    }
  });

  it('every statement is guarded with IF NOT EXISTS', () => {
    const sql = createPermitIndexesSql();
    const createCount = (sql.match(/CREATE INDEX/g) ?? []).length;
    const guardCount = (sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length;
    expect(guardCount).toBe(createCount);
  });
});
