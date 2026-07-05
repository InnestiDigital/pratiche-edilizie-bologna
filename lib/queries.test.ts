import { describe, it, expect } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import {
  getPermits,
  getPermitById,
  getStats,
  countNewPermits,
  markAllSeen,
  parsePermitTags,
  escapeLike,
  SORT_LABELS,
  type FeedFilters,
  type Permit,
} from './queries';

/**
 * Minimal fake of the slice of the expo-sqlite API that queries.ts uses.
 * It records every call (sql + flattened params) so tests can assert on the
 * generated SQL string and parameter ordering — the brittle part of these
 * functions — and returns programmable rows so the stats reducers and row
 * pass-through can be exercised without a native SQLite engine.
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
    expect(squish(calls[0].sql)).toContain(
      "(address LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\'))"
    );
    expect(calls[0].params).toEqual(['%Indipendenza%', '%Indipendenza%', '%Indipendenza%', 50, 0]);
  });

  it('escapes LIKE wildcards in the search term so they match literally', async () => {
    const { db, calls } = makeFakeDb();
    // A user typing "100%" or "via_" must match those literal strings, not use
    // % / _ as SQL wildcards. The escaped term is wrapped in the outer %…%.
    await getPermits(db, baseFilters({ searchQuery: '100%_ok\\' }));
    expect(calls[0].params).toEqual([
      '%100\\%\\_ok\\\\%',
      '%100\\%\\_ok\\\\%',
      '%100\\%\\_ok\\\\%',
      50,
      0,
    ]);
    // The ESCAPE clause is what makes the backslash prefixes literal.
    expect(squish(calls[0].sql)).toContain("ESCAPE '\\'");
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
      "WHERE zone IN (?) AND filing_type IN (?) AND (address LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\')) AND status IN (?) AND is_new = 1"
    );
    expect(calls[0].params).toEqual([
      'Navile',
      'SCIA',
      '%via%',
      '%via%',
      '%via%',
      'rilasciata',
      50,
      0,
    ]);
  });
});

describe('getPermits — sorting', () => {
  const cases: [FeedFilters['sort'], string][] = [
    ['newest', 'ORDER BY first_seen_at DESC'],
    ['oldest', 'ORDER BY first_seen_at ASC'],
    ['request_newest', 'ORDER BY source_updated_at DESC'],
    ['request_oldest', 'ORDER BY source_updated_at IS NULL, source_updated_at ASC'],
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

describe('getPermits — tag filter (SQL side, json_each)', () => {
  it('filters tags in SQL (json_each EXISTS), not by post-filtering the page', async () => {
    // The fake db returns rows verbatim; if getPermits still post-filtered in JS
    // these non-matching rows would be dropped. They are returned untouched, which
    // proves the filtering is delegated to SQL (correct LIMIT/OFFSET pagination).
    const rows = [permitRow({ id: 1, tags: '[]' }), permitRow({ id: 2, tags: '[]' })];
    const { db, calls } = makeFakeDb({ getAll: rows });
    const out = await getPermits(db, baseFilters({ tags: ['sanatoria'] }));
    expect(out.map((r) => r.id)).toEqual([1, 2]);
    expect(squish(calls[0].sql)).toContain(
      'json_valid(permits.tags) AND EXISTS (SELECT 1 FROM json_each(permits.tags) AS jt WHERE jt.value IN (?)'
    );
  });

  it('binds each requested tag as its own IN placeholder (OR semantics)', async () => {
    const { db, calls } = makeFakeDb({ getAll: [] });
    await getPermits(db, baseFilters({ tags: ['sanatoria', 'deroga'] }), 25, 100);
    expect(squish(calls[0].sql)).toContain('jt.value IN (?,?)');
    // tag params come before the trailing limit/offset
    expect(calls[0].params).toEqual(['sanatoria', 'deroga', 25, 100]);
  });

  it('emits no tag SQL and no tag params when no tags requested', async () => {
    const { db, calls } = makeFakeDb({ getAll: [] });
    await getPermits(db, baseFilters());
    expect(squish(calls[0].sql)).not.toContain('json_each');
    expect(calls[0].params).toEqual([50, 0]);
  });
});

describe('parsePermitTags', () => {
  it('parses a valid JSON string array', () => {
    expect(parsePermitTags(JSON.stringify(['sanatoria', 'deroga']))).toEqual([
      'sanatoria',
      'deroga',
    ]);
  });

  it('returns [] for an empty array', () => {
    expect(parsePermitTags('[]')).toEqual([]);
  });

  it('returns [] for malformed JSON instead of throwing', () => {
    expect(parsePermitTags('not json')).toEqual([]);
    expect(parsePermitTags('')).toEqual([]);
    expect(parsePermitTags('["unterminated')).toEqual([]);
  });

  it('returns [] when the JSON is valid but not an array', () => {
    expect(parsePermitTags('null')).toEqual([]);
    expect(parsePermitTags('42')).toEqual([]);
    expect(parsePermitTags('"sanatoria"')).toEqual([]);
    expect(parsePermitTags('{"sanatoria":true}')).toEqual([]);
  });

  it('drops non-string array elements, keeping the valid strings', () => {
    expect(parsePermitTags('["sanatoria", 1, null, "deroga", true]')).toEqual([
      'sanatoria',
      'deroga',
    ]);
  });
});

describe('escapeLike', () => {
  it('leaves a plain term untouched', () => {
    expect(escapeLike('Indipendenza')).toBe('Indipendenza');
    expect(escapeLike('')).toBe('');
  });

  it('escapes the % wildcard', () => {
    expect(escapeLike('100%')).toBe('100\\%');
  });

  it('escapes the _ single-char wildcard', () => {
    expect(escapeLike('via_')).toBe('via\\_');
  });

  it('escapes the backslash escape char itself, first', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('escapes every special char in one pass without double-escaping', () => {
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
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

describe('countNewPermits', () => {
  it('counts only rows with is_new = 1', async () => {
    const { db, calls } = makeFakeDb({ getFirst: { c: 4 } });
    const count = await countNewPermits(db);
    expect(count).toBe(4);
    expect(squish(calls[0].sql)).toBe('SELECT COUNT(*) as c FROM permits WHERE is_new = 1');
  });

  it('defaults to 0 when the count query returns null', async () => {
    const { db } = makeFakeDb({ getFirst: null });
    expect(await countNewPermits(db)).toBe(0);
  });
});

describe('markAllSeen', () => {
  it('clears the is_new flag for new rows only', async () => {
    const { db, calls } = makeFakeDb();
    await markAllSeen(db);
    expect(squish(calls[0].sql)).toBe('UPDATE permits SET is_new = 0 WHERE is_new = 1');
  });
});
