import { describe, it, expect } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import {
  getPermits,
  getPermitById,
  getStats,
  markAllSeen,
  SORT_LABELS,
  type FeedFilters,
  type Permit,
} from './queries';

/**
 * Minimal fake of the slice of the expo-sqlite API that queries.ts uses.
 * It records every call (sql + flattened params) so tests can assert on the
 * generated SQL string and parameter ordering — the brittle part of these
 * functions — and returns programmable rows so the JS-side tag post-filter and
 * the stats reducers can be exercised without a native SQLite engine.
 */
interface RecordedCall {
  sql: string;
  params: unknown[];
}

function makeFakeDb(
  results: {
    getAll?: unknown[];
    getFirst?: unknown;
  } = {}
) {
  const calls: RecordedCall[] = [];
  const db = {
    getAllAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return (results.getAll ?? []) as never;
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return (results.getFirst ?? null) as never;
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return { changes: 0, lastInsertRowId: 0 } as never;
    },
  } as unknown as SQLite.SQLiteDatabase;
  return { db, calls };
}

/** Collapse runs of whitespace so SQL assertions ignore formatting. */
function squish(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function baseFilters(overrides: Partial<FeedFilters> = {}): FeedFilters {
  return { zones: [], filingTypes: [], tags: [], ...overrides };
}

function permitRow(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 1,
    dataset: 'pdc',
    source_id: 'abc',
    filing_type: 'PDC',
    source_updated_at: '2025-03-01',
    first_seen_at: '2025-03-02',
    address: 'Via Indipendenza 10',
    zone: 'Navile',
    codvia: 350,
    procedimento: 'PDC ORDINARIO',
    date_issued: '2025-06-01',
    status: 'rilasciata',
    status_raw: 'Rilasciata',
    tags: '[]',
    source_link: null,
    is_new: 0,
    ...overrides,
  };
}

describe('getPermits — WHERE construction', () => {
  it('emits no WHERE clause with empty filters', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters());
    const sql = squish(calls[0].sql);
    expect(sql).not.toContain('WHERE');
    expect(sql).toContain('ORDER BY first_seen_at DESC');
  });

  it('builds an IN clause for zones with one placeholder per zone', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ zones: ['Navile', 'Savena'] }));
    const sql = squish(calls[0].sql);
    expect(sql).toContain('WHERE zone IN (?,?)');
    // params: 2 zones, then LIMIT, OFFSET
    expect(calls[0].params).toEqual(['Navile', 'Savena', 50, 0]);
  });

  it('builds an IN clause for filing types', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ filingTypes: ['PDC', 'CILA'] }));
    expect(squish(calls[0].sql)).toContain('filing_type IN (?,?)');
    expect(calls[0].params).toEqual(['PDC', 'CILA', 50, 0]);
  });

  it('builds a wrapped LIKE pair for searchQuery against address and procedimento', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ searchQuery: 'Indipendenza' }));
    expect(squish(calls[0].sql)).toContain('(address LIKE ? OR procedimento LIKE ?)');
    expect(calls[0].params).toEqual(['%Indipendenza%', '%Indipendenza%', 50, 0]);
  });

  it('builds an IN clause for statuses', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ statuses: ['rilasciata', 'diniegata'] }));
    expect(squish(calls[0].sql)).toContain('status IN (?,?)');
    expect(calls[0].params).toEqual(['rilasciata', 'diniegata', 50, 0]);
  });

  it('adds is_new = 1 when onlyNew is set, without a param', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ onlyNew: true }));
    expect(squish(calls[0].sql)).toContain('is_new = 1');
    expect(calls[0].params).toEqual([50, 0]);
  });

  it('omits is_new condition when onlyNew is false', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ onlyNew: false }));
    expect(squish(calls[0].sql)).not.toContain('is_new');
  });

  it('joins multiple conditions with AND in declared order and keeps param order', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(
      db,
      baseFilters({
        zones: ['Navile'],
        filingTypes: ['SCIA'],
        searchQuery: 'via',
        statuses: ['rilasciata'],
        onlyNew: true,
      })
    );
    const sql = squish(calls[0].sql);
    expect(sql).toContain(
      'WHERE zone IN (?) AND filing_type IN (?) AND (address LIKE ? OR procedimento LIKE ?) AND status IN (?) AND is_new = 1'
    );
    expect(calls[0].params).toEqual(['Navile', 'SCIA', '%via%', '%via%', 'rilasciata', 50, 0]);
  });
});

describe('getPermits — sorting', () => {
  const cases: [FeedFilters['sort'], string][] = [
    ['newest', 'ORDER BY first_seen_at DESC'],
    ['oldest', 'ORDER BY first_seen_at ASC'],
    ['request_newest', 'ORDER BY source_updated_at DESC'],
    ['request_oldest', 'ORDER BY source_updated_at ASC'],
    ['closing_newest', 'ORDER BY date_issued DESC'],
  ];

  for (const [sort, expected] of cases) {
    it(`maps sort "${sort}" to ${expected}`, async () => {
      const { db, calls } = makeFakeDb();
      await getPermits(db, baseFilters({ sort }));
      expect(squish(calls[0].sql)).toContain(expected);
    });
  }

  it('defaults to newest when sort is undefined', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters());
    expect(squish(calls[0].sql)).toContain('ORDER BY first_seen_at DESC');
  });

  it('every SortOption has a human label', () => {
    for (const [sort] of cases) {
      expect(SORT_LABELS[sort!]).toBeTruthy();
    }
  });
});

describe('getPermits — pagination', () => {
  it('uses default limit 50 / offset 0', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters());
    expect(squish(calls[0].sql)).toContain('LIMIT ? OFFSET ?');
    expect(calls[0].params).toEqual([50, 0]);
  });

  it('passes through explicit limit and offset as the trailing params', async () => {
    const { db, calls } = makeFakeDb();
    await getPermits(db, baseFilters({ zones: ['Navile'] }), 25, 100);
    expect(calls[0].params).toEqual(['Navile', 25, 100]);
  });
});

describe('getPermits — tag post-filter (JS side)', () => {
  it('keeps only rows whose tags JSON intersects the requested tags', async () => {
    const rows = [
      permitRow({ id: 1, tags: JSON.stringify(['sanatoria', 'parziale']) }),
      permitRow({ id: 2, tags: JSON.stringify(['deroga']) }),
      permitRow({ id: 3, tags: JSON.stringify([]) }),
    ];
    const { db } = makeFakeDb({ getAll: rows });
    const out = await getPermits(db, baseFilters({ tags: ['sanatoria'] }));
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('matches if any requested tag is present (OR semantics)', async () => {
    const rows = [
      permitRow({ id: 1, tags: JSON.stringify(['sanatoria']) }),
      permitRow({ id: 2, tags: JSON.stringify(['deroga']) }),
      permitRow({ id: 3, tags: JSON.stringify(['telefonia']) }),
    ];
    const { db } = makeFakeDb({ getAll: rows });
    const out = await getPermits(db, baseFilters({ tags: ['sanatoria', 'deroga'] }));
    expect(out.map((r) => r.id)).toEqual([1, 2]);
  });

  it('returns rows untouched when no tags requested', async () => {
    const rows = [permitRow({ id: 1 }), permitRow({ id: 2 })];
    const { db } = makeFakeDb({ getAll: rows });
    const out = await getPermits(db, baseFilters());
    expect(out).toHaveLength(2);
  });

  it('does not pass tags into the SQL params (post-filtered only)', async () => {
    const { db, calls } = makeFakeDb({ getAll: [] });
    await getPermits(db, baseFilters({ tags: ['sanatoria'] }));
    expect(calls[0].params).toEqual([50, 0]);
  });
});

describe('getPermitById', () => {
  it('queries by id and returns the row', async () => {
    const row = permitRow({ id: 42 });
    const { db, calls } = makeFakeDb({ getFirst: row });
    const out = await getPermitById(db, 42);
    expect(squish(calls[0].sql)).toBe('SELECT * FROM permits WHERE id = ?');
    expect(calls[0].params).toEqual([42]);
    expect(out).toEqual(row);
  });

  it('returns null when not found', async () => {
    const { db } = makeFakeDb({ getFirst: null });
    expect(await getPermitById(db, 999)).toBeNull();
  });
});

describe('getStats', () => {
  it('aggregates totals, new count, and groups into records', async () => {
    // getStats issues: getFirst(total), getFirst(newCount), getAll(byDataset), getAll(byZone)
    const calls: RecordedCall[] = [];
    let firstCall = 0;
    const db = {
      getFirstAsync: async (sql: string, ...params: unknown[]) => {
        calls.push({ sql, params });
        firstCall += 1;
        return (firstCall === 1 ? { c: 7 } : { c: 3 }) as never;
      },
      getAllAsync: async (sql: string, ...params: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('dataset')) {
          return [
            { dataset: 'pdc', c: 4 },
            { dataset: 'scia', c: 3 },
          ] as never;
        }
        return [
          { zone: 'Navile', c: 5 },
          { zone: 'Savena', c: 2 },
        ] as never;
      },
    } as unknown as SQLite.SQLiteDatabase;

    const stats = await getStats(db);
    expect(stats.total).toBe(7);
    expect(stats.newCount).toBe(3);
    expect(stats.byDataset).toEqual({ pdc: 4, scia: 3 });
    expect(stats.byZone).toEqual({ Navile: 5, Savena: 2 });
  });

  it('defaults total and newCount to 0 when the count query returns null', async () => {
    const db = {
      getFirstAsync: async () => null as never,
      getAllAsync: async () => [] as never,
    } as unknown as SQLite.SQLiteDatabase;
    const stats = await getStats(db);
    expect(stats.total).toBe(0);
    expect(stats.newCount).toBe(0);
    expect(stats.byDataset).toEqual({});
    expect(stats.byZone).toEqual({});
  });
});

describe('markAllSeen', () => {
  it('clears the is_new flag for new rows only', async () => {
    const { db, calls } = makeFakeDb();
    await markAllSeen(db);
    expect(squish(calls[0].sql)).toBe('UPDATE permits SET is_new = 0 WHERE is_new = 1');
  });
});
