import { describe, it, expect } from 'vitest';
import {
  buildFeedQuery,
  buildFeedCountQuery,
  buildFeedWhere,
  escapeLike,
  SORT_LABELS,
  type FeedFilters,
} from './build-feed-query';

/** Collapse runs of whitespace so assertions ignore formatting/indentation. */
function squish(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

const EMPTY: FeedFilters = { zones: [], filingTypes: [], tags: [] };

describe('buildFeedQuery — WHERE construction', () => {
  it('emits no WHERE clause with empty filters', () => {
    const { sql } = buildFeedQuery(EMPTY, 50, 0);
    expect(squish(sql)).not.toContain('WHERE');
    expect(squish(sql)).toContain('ORDER BY first_seen_at DESC');
  });

  it('builds a zone IN list with one placeholder per zone, params first', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, zones: ['Navile', 'Savena'] }, 50, 0);
    expect(squish(sql)).toContain('WHERE zone IN (?,?)');
    // zones first, then LIMIT, OFFSET
    expect(params).toEqual(['Navile', 'Savena', 50, 0]);
  });

  it('builds a filing_type IN list', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, filingTypes: ['PDC', 'CILA'] }, 50, 0);
    expect(squish(sql)).toContain('filing_type IN (?,?)');
    expect(params).toEqual(['PDC', 'CILA', 50, 0]);
  });

  it('builds a wrapped LIKE pair for searchQuery with an ESCAPE clause', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, searchQuery: 'Indipendenza' }, 50, 0);
    expect(squish(sql)).toContain(
      "(address LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\')"
    );
    // same escaped %term% bound twice, then LIMIT/OFFSET
    expect(params).toEqual(['%Indipendenza%', '%Indipendenza%', 50, 0]);
  });

  it('escapes LIKE wildcards in the search term so they match literally', () => {
    const { params } = buildFeedQuery({ ...EMPTY, searchQuery: '100%' }, 50, 0);
    expect(params[0]).toBe('%100\\%%');
  });

  it('builds a status IN list', () => {
    const { sql, params } = buildFeedQuery(
      { ...EMPTY, statuses: ['rilasciata', 'diniegata'] },
      50,
      0
    );
    expect(squish(sql)).toContain('status IN (?,?)');
    expect(params).toEqual(['rilasciata', 'diniegata', 50, 0]);
  });

  it('adds a parameterless is_new predicate for onlyNew', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, onlyNew: true }, 50, 0);
    expect(squish(sql)).toContain('is_new = 1');
    // no param for is_new — only LIMIT/OFFSET
    expect(params).toEqual([50, 0]);
  });

  it('omits is_new when onlyNew is false/undefined', () => {
    expect(squish(buildFeedQuery({ ...EMPTY, onlyNew: false }, 50, 0).sql)).not.toContain('is_new');
    expect(squish(buildFeedQuery(EMPTY, 50, 0).sql)).not.toContain('is_new');
  });

  it('adds a parameterless favorites EXISTS predicate for onlyFavorites', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, onlyFavorites: true }, 50, 0);
    expect(squish(sql)).toContain(
      'EXISTS (SELECT 1 FROM favorites WHERE favorites.source_id = permits.source_id)'
    );
    // no param for the favorites join — only LIMIT/OFFSET
    expect(params).toEqual([50, 0]);
  });

  it('omits the favorites join when onlyFavorites is false/undefined', () => {
    expect(squish(buildFeedQuery({ ...EMPTY, onlyFavorites: false }, 50, 0).sql)).not.toContain(
      'favorites'
    );
    expect(squish(buildFeedQuery(EMPTY, 50, 0).sql)).not.toContain('favorites');
  });

  it('ANDs every active filter in a fixed order with correctly ordered params', () => {
    const { sql, params } = buildFeedQuery(
      {
        zones: ['Navile'],
        filingTypes: ['PDC'],
        tags: [],
        searchQuery: 'via',
        statuses: ['rilasciata'],
        onlyNew: true,
      },
      10,
      20
    );
    expect(squish(sql)).toContain(
      "WHERE zone IN (?) AND filing_type IN (?) AND (address LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\') AND status IN (?) AND is_new = 1"
    );
    // zone, filing_type, search x2, status, then LIMIT/OFFSET (is_new binds nothing)
    expect(params).toEqual(['Navile', 'PDC', '%via%', '%via%', 'rilasciata', 10, 20]);
  });
});

describe('buildFeedQuery — tag filter (json_each)', () => {
  it('emits a json_valid-guarded json_each EXISTS with one placeholder per tag', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, tags: ['sanatoria', 'deroga'] }, 50, 0);
    expect(squish(sql)).toContain(
      'WHERE (json_valid(permits.tags) AND EXISTS (SELECT 1 FROM json_each(permits.tags) AS jt WHERE jt.value IN (?,?)))'
    );
    // tag params, then LIMIT/OFFSET
    expect(params).toEqual(['sanatoria', 'deroga', 50, 0]);
  });

  it('emits no tag SQL when tags is empty', () => {
    expect(squish(buildFeedQuery(EMPTY, 50, 0).sql)).not.toContain('json_each');
  });

  it('orders tag params last among filters, before LIMIT/OFFSET', () => {
    const { sql, params } = buildFeedQuery(
      { zones: ['Navile'], filingTypes: ['PDC'], tags: ['sanatoria'], onlyNew: true },
      10,
      20
    );
    expect(squish(sql)).toContain(
      'WHERE zone IN (?) AND filing_type IN (?) AND is_new = 1 AND (json_valid(permits.tags) AND EXISTS (SELECT 1 FROM json_each(permits.tags) AS jt WHERE jt.value IN (?)))'
    );
    // zone, filing_type, (is_new binds nothing), tag, then LIMIT/OFFSET
    expect(params).toEqual(['Navile', 'PDC', 'sanatoria', 10, 20]);
  });
});

describe('buildFeedQuery — sort mapping', () => {
  it.each([
    ['newest', 'ORDER BY first_seen_at DESC, id DESC'],
    ['oldest', 'ORDER BY first_seen_at ASC, id ASC'],
    ['request_newest', 'ORDER BY source_updated_at DESC, id DESC'],
    ['request_oldest', 'ORDER BY source_updated_at ASC, id ASC'],
    ['closing_newest', 'ORDER BY date_issued DESC, id DESC'],
  ] as const)('maps sort=%s to %s', (sort, expected) => {
    expect(squish(buildFeedQuery({ ...EMPTY, sort }, 50, 0).sql)).toContain(expected);
  });

  it('defaults to newest when no sort is given', () => {
    expect(squish(buildFeedQuery(EMPTY, 50, 0).sql)).toContain(
      'ORDER BY first_seen_at DESC, id DESC'
    );
  });

  it('ends every sort in the unique id PK so pagination is stable across pages', () => {
    // The primary sort columns are all non-unique (a sync batch shares first_seen_at;
    // request/closing dates repeat and can be NULL). Without the id tiebreaker the order
    // among tied rows is undefined and unstable across separate LIMIT/OFFSET queries, so
    // infinite scroll could dupe/skip rows. Every ORDER BY must terminate in `id`.
    const sorts = [
      'newest',
      'oldest',
      'request_newest',
      'request_oldest',
      'closing_newest',
    ] as const;
    for (const sort of sorts) {
      const orderBy = squish(buildFeedQuery({ ...EMPTY, sort }, 50, 0).sql)
        .split('ORDER BY')[1]
        .split('LIMIT')[0]
        .trim();
      expect(orderBy).toMatch(/, id (ASC|DESC)$/);
    }
  });

  it('has a label for every sort key', () => {
    for (const key of Object.keys(SORT_LABELS)) {
      expect(SORT_LABELS[key as keyof typeof SORT_LABELS]).toBeTruthy();
    }
  });
});

describe('buildFeedQuery — pagination', () => {
  it('always appends LIMIT ? OFFSET ? as the last two params', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, zones: ['Navile'] }, 25, 75);
    expect(squish(sql)).toContain('LIMIT ? OFFSET ?');
    expect(params.slice(-2)).toEqual([25, 75]);
  });
});

describe('buildFeedCountQuery', () => {
  it('emits SELECT COUNT(*) with no ORDER BY / LIMIT / OFFSET on empty filters', () => {
    const { sql, params } = buildFeedCountQuery(EMPTY);
    expect(squish(sql)).toBe('SELECT COUNT(*) as c FROM permits');
    expect(squish(sql)).not.toContain('WHERE');
    expect(squish(sql)).not.toContain('ORDER BY');
    expect(squish(sql)).not.toContain('LIMIT');
    expect(squish(sql)).not.toContain('OFFSET');
    expect(params).toEqual([]);
  });

  it('reuses the exact feed WHERE + param order, without pagination params', () => {
    const filters: FeedFilters = {
      zones: ['Navile'],
      filingTypes: ['PDC'],
      tags: ['sanatoria'],
      searchQuery: 'via',
      statuses: ['rilasciata'],
      onlyNew: true,
    };
    const count = buildFeedCountQuery(filters);
    const feed = buildFeedQuery(filters, 10, 20);
    // Same WHERE text in both queries.
    const feedWhere = squish(feed.sql).split('ORDER BY')[0].replace('SELECT * FROM permits ', '');
    const countWhere = squish(count.sql).replace('SELECT COUNT(*) as c FROM permits ', '');
    expect(countWhere.trim()).toBe(feedWhere.trim());
    // Count params == feed params minus the trailing LIMIT/OFFSET.
    expect(count.params).toEqual(feed.params.slice(0, -2));
    expect(count.params).toEqual(['Navile', 'PDC', '%via%', '%via%', 'rilasciata', 'sanatoria']);
  });

  it('ignores the sort option (no ORDER BY in a count)', () => {
    expect(squish(buildFeedCountQuery({ ...EMPTY, sort: 'closing_newest' }).sql)).not.toContain(
      'ORDER BY'
    );
  });
});

describe('buildFeedWhere', () => {
  it('returns an empty where + no params for empty filters', () => {
    expect(buildFeedWhere(EMPTY)).toEqual({ where: '', params: [] });
  });

  it('returns a fresh params array each call (no shared mutable state)', () => {
    const a = buildFeedWhere({ ...EMPTY, zones: ['Navile'] });
    const b = buildFeedWhere({ ...EMPTY, zones: ['Navile'] });
    expect(a.params).not.toBe(b.params);
    expect(a.params).toEqual(b.params);
  });
});

describe('escapeLike', () => {
  it('leaves a plain term untouched', () => {
    expect(escapeLike('Indipendenza')).toBe('Indipendenza');
    expect(escapeLike('')).toBe('');
  });

  it('escapes %, _ and backslash', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('via_')).toBe('via\\_');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
  });
});
