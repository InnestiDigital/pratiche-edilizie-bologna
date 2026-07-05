import { describe, it, expect } from 'vitest';
import {
  buildFeedQuery,
  buildFeedCountQuery,
  buildFeedWhere,
  buildProtocolSearchPatterns,
  escapeLike,
  SORT_LABELS,
  type FeedFilters,
} from './build-feed-query';
import { QUARTIERI, type Quartiere } from './constants';

// The exact request-date expression the feed sorts/filters on (eventi have no
// request date and fall back to their discovery date). Kept as a literal here so
// the test pins the produced SQL, not the implementation constant.
const REQUEST_DATE_SQL =
  "CASE WHEN category = 'eventi' THEN first_seen_at ELSE source_updated_at END";

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

  it('omits the zone predicate when the selection covers every quartiere (finding 4)', () => {
    // A full-quartieri selection means "no zone preference": emitting no predicate
    // lets NULL-zone rows (city-wide events, unmapped districts) appear — the old
    // unconditional `zone IN (...)` silently excluded them since `NULL IN (...)` is
    // never true. Applies to both the row and count queries.
    const filters = { ...EMPTY, zones: [...QUARTIERI] };
    const row = buildFeedQuery(filters, 50, 0);
    expect(squish(row.sql)).not.toContain('zone IN');
    expect(row.params).toEqual([50, 0]);
    const count = buildFeedCountQuery(filters);
    expect(squish(count.sql)).not.toContain('zone IN');
    expect(count.params).toEqual([]);
  });

  it('omits the zone predicate for a duplicated full set (Set-based coverage check)', () => {
    // A duplicated stored quartiere must not fake a "narrowed" set: the coverage
    // test is on the distinct set, so a full set with a repeat still emits nothing.
    const { sql, params } = buildFeedQuery({ ...EMPTY, zones: [...QUARTIERI, 'Navile'] }, 50, 0);
    expect(squish(sql)).not.toContain('zone IN');
    expect(params).toEqual([50, 0]);
  });

  it('keeps the strict zone IN for a genuinely narrowed selection', () => {
    // Fewer than all quartieri = an explicit district scope; NULL-zone rows are
    // then correctly hidden (a narrowed filter means "only these districts").
    const { sql, params } = buildFeedQuery({ ...EMPTY, zones: ['Navile'] }, 50, 0);
    expect(squish(sql)).toContain('WHERE zone IN (?)');
    expect(params).toEqual(['Navile', 50, 0]);
  });

  it('keeps the strict zone IN on the count query for a narrowed selection too', () => {
    // Same predicate symmetry the full-set-omission test checks on both queries:
    // a genuinely narrowed selection must stay strict on the count side as well,
    // or the displayed total would drift from the listed rows.
    const filters = { ...EMPTY, zones: ['Navile'] as Quartiere[] };
    const count = buildFeedCountQuery(filters);
    expect(squish(count.sql)).toContain('WHERE zone IN (?)');
    expect(count.params).toEqual(['Navile']);
  });

  it('leaves a single-zone-short-of-full selection narrowed (off-by-one boundary)', () => {
    // QUARTIERI.length - 1 distinct zones must NOT be mistaken for "all zones":
    // the coverage check is a strict `<`, so this pins the boundary right below it.
    const filters = { ...EMPTY, zones: QUARTIERI.slice(1) };
    const { sql, params } = buildFeedQuery(filters, 50, 0);
    expect(squish(sql)).toContain(
      `zone IN (${QUARTIERI.slice(1)
        .map(() => '?')
        .join(',')})`
    );
    expect(params).toEqual([...QUARTIERI.slice(1), 50, 0]);
  });

  it('builds a filing_type IN list', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, filingTypes: ['PDC', 'CILA'] }, 50, 0);
    expect(squish(sql)).toContain('filing_type IN (?,?)');
    expect(params).toEqual(['PDC', 'CILA', 50, 0]);
  });

  it('scopes the filing_type IN test to edilizia rows so it never excludes other categories', () => {
    // The filing-type chips are edilizia-only sub-filters; wrapping the IN test in
    // `category <> 'edilizia' OR ...` means a non-edilizia row (a cantiere, event,
    // …) is kept regardless of its `filing_type` token. On an all-edilizia DB this
    // is provably identical to a bare `filing_type IN (...)` (no row has
    // category <> 'edilizia', so every row still gates on the IN). Params unchanged.
    const { sql, params } = buildFeedQuery({ ...EMPTY, filingTypes: ['PDC', 'CILA'] }, 50, 0);
    expect(squish(sql)).toContain("(category <> 'edilizia' OR filing_type IN (?,?))");
    expect(params).toEqual(['PDC', 'CILA', 50, 0]);
  });

  it('builds an address/title/procedimento/note LIKE group for searchQuery with ESCAPE clauses', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, searchQuery: 'Indipendenza' }, 50, 0);
    expect(squish(sql)).toContain(
      "(address LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\'))"
    );
    // same escaped %term% bound four times (address, title, procedimento, note), then LIMIT/OFFSET
    expect(params).toEqual([
      '%Indipendenza%',
      '%Indipendenza%',
      '%Indipendenza%',
      '%Indipendenza%',
      50,
      0,
    ]);
  });

  it('matches the resident personal note (permit_notes) as part of the search', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, searchQuery: 'Soprintendenza' }, 50, 0);
    // Correlated EXISTS on permit_notes, ORed into the search group so a term the
    // user jotted on a permit surfaces that permit.
    expect(squish(sql)).toContain(
      "OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\'))"
    );
    // the note branch binds the same %term% as address/title/procedimento
    expect(params).toEqual([
      '%Soprintendenza%',
      '%Soprintendenza%',
      '%Soprintendenza%',
      '%Soprintendenza%',
      50,
      0,
    ]);
  });

  it('escapes LIKE wildcards in the note-search branch too', () => {
    const { params } = buildFeedQuery({ ...EMPTY, searchQuery: '50%' }, 50, 0);
    // address, title, procedimento, note all get the same escaped pattern
    expect(params.slice(0, 4)).toEqual(['%50\\%%', '%50\\%%', '%50\\%%', '%50\\%%']);
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

  it('adds a request-date lower-bound predicate for requestedAfter (eventi-aware)', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, requestedAfter: '2024-01-01' }, 50, 0);
    // Uses the eventi-aware request-date expression so an event is filtered by its
    // discovery date, not a NULL source_updated_at that would exclude it entirely.
    expect(squish(sql)).toContain(`${REQUEST_DATE_SQL} >= ?`);
    // the bound binds before LIMIT/OFFSET
    expect(params).toEqual(['2024-01-01', 50, 0]);
  });

  it('omits the request-date bound when requestedAfter is unset', () => {
    expect(squish(buildFeedQuery(EMPTY, 50, 0).sql)).not.toContain('>= ?');
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

  it('adds a parameterless permit_notes EXISTS predicate for onlyNoted', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, onlyNoted: true }, 50, 0);
    expect(squish(sql)).toContain(
      'EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id)'
    );
    // no param for the notes join — only LIMIT/OFFSET
    expect(params).toEqual([50, 0]);
  });

  it('omits the permit_notes join when onlyNoted is false/undefined', () => {
    expect(squish(buildFeedQuery({ ...EMPTY, onlyNoted: false }, 50, 0).sql)).not.toContain(
      'permit_notes'
    );
    expect(squish(buildFeedQuery(EMPTY, 50, 0).sql)).not.toContain('permit_notes');
  });

  it('applies the same onlyNoted predicate to the count query', () => {
    expect(squish(buildFeedCountQuery({ ...EMPTY, onlyNoted: true }).sql)).toContain(
      'EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id)'
    );
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
      "WHERE zone IN (?) AND (category <> 'edilizia' OR filing_type IN (?)) AND (address LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\')) AND status IN (?) AND is_new = 1"
    );
    // zone, filing_type, search x4 (address/title/procedimento/note), status, then LIMIT/OFFSET (is_new binds nothing)
    expect(params).toEqual([
      'Navile',
      'PDC',
      '%via%',
      '%via%',
      '%via%',
      '%via%',
      'rilasciata',
      10,
      20,
    ]);
  });
});

describe('buildProtocolSearchPatterns', () => {
  it('returns [] for a text (non-protocol) query so address search is untouched', () => {
    expect(buildProtocolSearchPatterns('Indipendenza')).toEqual([]);
    expect(buildProtocolSearchPatterns('via Marconi')).toEqual([]);
    // A mixed alphanumeric term (a letter present) is still a text search.
    expect(buildProtocolSearchPatterns('PDC-2024')).toEqual([]);
  });

  it('returns a single %number% pattern for a bare number', () => {
    expect(buildProtocolSearchPatterns('481')).toEqual(['%481%']);
    expect(buildProtocolSearchPatterns('000481')).toEqual(['%000481%']);
  });

  it('splits the displayed number/year protocol into order-independent groups', () => {
    // Displayed as `000481/2024`; source_id is `PDC-2024-000481` (year before
    // number), so both groups are ANDed as substrings rather than one ordered pattern.
    expect(buildProtocolSearchPatterns('000481/2024')).toEqual(['%000481%', '%2024%']);
    expect(buildProtocolSearchPatterns('481/2024')).toEqual(['%481%', '%2024%']);
  });

  it('accepts any protocol separator (slash, dash, whitespace)', () => {
    expect(buildProtocolSearchPatterns('000481 2024')).toEqual(['%000481%', '%2024%']);
    expect(buildProtocolSearchPatterns('000481-2024')).toEqual(['%000481%', '%2024%']);
  });

  it('trims and ignores separator-only / empty input', () => {
    expect(buildProtocolSearchPatterns('  481  ')).toEqual(['%481%']);
    expect(buildProtocolSearchPatterns('/')).toEqual([]);
    expect(buildProtocolSearchPatterns('')).toEqual([]);
  });
});

describe('buildFeedQuery — category filter', () => {
  it('emits no category SQL/params when categories is omitted (regression pin)', () => {
    const omitted = buildFeedQuery({ ...EMPTY, zones: ['Navile'], filingTypes: ['PDC'] }, 50, 0);
    // Byte-identical to a call that never knew about categories.
    expect(squish(omitted.sql)).not.toContain('category IN');
    expect(omitted.params).toEqual(['Navile', 'PDC', 50, 0]);
  });

  it('emits no category SQL when categories is an empty array', () => {
    const empty = buildFeedQuery({ ...EMPTY, categories: [] }, 50, 0);
    expect(squish(empty.sql)).not.toContain('category');
    expect(empty.params).toEqual([50, 0]);
  });

  it('builds a category IN list with one placeholder per category', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, categories: ['edilizia'] }, 50, 0);
    expect(squish(sql)).toContain('category IN (?)');
    expect(params).toEqual(['edilizia', 50, 0]);
  });

  it('orders category params after zones and filingTypes', () => {
    const { sql, params } = buildFeedQuery(
      { ...EMPTY, zones: ['Navile'], filingTypes: ['PDC'], categories: ['edilizia'] },
      10,
      20
    );
    expect(squish(sql)).toContain(
      "WHERE zone IN (?) AND (category <> 'edilizia' OR filing_type IN (?)) AND category IN (?)"
    );
    // zones, filingTypes, categories, then LIMIT/OFFSET
    expect(params).toEqual(['Navile', 'PDC', 'edilizia', 10, 20]);
  });
});

describe('buildFeedQuery — protocol-aware search', () => {
  it('ORs a source_id LIKE branch onto the search for a bare number', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, searchQuery: '481' }, 50, 0);
    expect(squish(sql)).toContain(
      "(address LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\') OR (source_id LIKE ? ESCAPE '\\'))"
    );
    // address, title, procedimento, note, then the single protocol pattern, then LIMIT/OFFSET
    expect(params).toEqual(['%481%', '%481%', '%481%', '%481%', '%481%', 50, 0]);
  });

  it('ANDs each numeric group of a number/year protocol inside the source_id branch', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, searchQuery: '000481/2024' }, 50, 0);
    expect(squish(sql)).toContain(
      "OR (source_id LIKE ? ESCAPE '\\' AND source_id LIKE ? ESCAPE '\\')"
    );
    // address, title, procedimento, note (all the raw term), then the two protocol groups
    expect(params).toEqual([
      '%000481/2024%',
      '%000481/2024%',
      '%000481/2024%',
      '%000481/2024%',
      '%000481%',
      '%2024%',
      50,
      0,
    ]);
  });

  it('leaves a text search with no source_id LIKE (protocol) branch', () => {
    const { sql, params } = buildFeedQuery({ ...EMPTY, searchQuery: 'Marconi' }, 50, 0);
    expect(squish(sql)).toContain(
      "(address LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM permit_notes WHERE permit_notes.source_id = permits.source_id AND permit_notes.note LIKE ? ESCAPE '\\'))"
    );
    // the note EXISTS references source_id, but there is no protocol `source_id LIKE` branch
    expect(squish(sql)).not.toContain('source_id LIKE');
    expect(params).toEqual(['%Marconi%', '%Marconi%', '%Marconi%', '%Marconi%', 50, 0]);
  });

  it('keeps the count query consistent with the protocol-aware feed WHERE', () => {
    const filters: FeedFilters = { ...EMPTY, searchQuery: '000481/2024' };
    const feed = buildFeedQuery(filters, 10, 20);
    const count = buildFeedCountQuery(filters);
    expect(count.params).toEqual(feed.params.slice(0, -2));
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
      "WHERE zone IN (?) AND (category <> 'edilizia' OR filing_type IN (?)) AND is_new = 1 AND (json_valid(permits.tags) AND EXISTS (SELECT 1 FROM json_each(permits.tags) AS jt WHERE jt.value IN (?)))"
    );
    // zone, filing_type, (is_new binds nothing), tag, then LIMIT/OFFSET
    expect(params).toEqual(['Navile', 'PDC', 'sanatoria', 10, 20]);
  });
});

describe('buildFeedQuery — sort mapping', () => {
  it.each([
    ['newest', 'ORDER BY first_seen_at DESC, id DESC'],
    ['oldest', 'ORDER BY first_seen_at ASC, id ASC'],
    ['request_newest', `ORDER BY ${REQUEST_DATE_SQL} DESC, id DESC`],
    ['request_oldest', `ORDER BY ${REQUEST_DATE_SQL} IS NULL, ${REQUEST_DATE_SQL} ASC, id ASC`],
    ['closing_newest', 'ORDER BY date_issued DESC, id DESC'],
  ] as const)('maps sort=%s to %s', (sort, expected) => {
    expect(squish(buildFeedQuery({ ...EMPTY, sort }, 50, 0).sql)).toContain(expected);
  });

  it('ranks eventi by discovery date and other categories by request date', () => {
    // Eventi carry a NULL request date (their future `start` lives in `extra`), so
    // the request_* sorts fall back to first_seen_at for them via a CASE, leaving
    // edilizia rows on source_updated_at — byte-identical ordering to before for
    // edilizia, and events no longer outrank freshly issued permits.
    const orderBy = squish(buildFeedQuery({ ...EMPTY, sort: 'request_newest' }, 50, 0).sql)
      .split('ORDER BY')[1]
      .split('LIMIT')[0]
      .trim();
    expect(orderBy).toBe(`${REQUEST_DATE_SQL} DESC, id DESC`);
  });

  it('sinks NULL request dates to the bottom of the oldest-request-first sort', () => {
    // SQLite ranks NULL below every value, so a bare `<request date> ASC` would
    // float the undated permits to the TOP of "Data richiesta (meno recenti)" — the
    // opposite of what the resident asked for. The leading `<request date> IS NULL`
    // guard (0 for a real date, 1 for NULL) keeps the undated rows last.
    const orderBy = squish(buildFeedQuery({ ...EMPTY, sort: 'request_oldest' }, 50, 0).sql)
      .split('ORDER BY')[1]
      .split('LIMIT')[0]
      .trim();
    expect(orderBy).toBe(`${REQUEST_DATE_SQL} IS NULL, ${REQUEST_DATE_SQL} ASC, id ASC`);
    // The DESC counterpart needs no guard: NULL already sorts last under DESC.
    const orderByDesc = squish(buildFeedQuery({ ...EMPTY, sort: 'request_newest' }, 50, 0).sql)
      .split('ORDER BY')[1]
      .split('LIMIT')[0]
      .trim();
    expect(orderByDesc).toBe(`${REQUEST_DATE_SQL} DESC, id DESC`);
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
    expect(count.params).toEqual([
      'Navile',
      'PDC',
      '%via%',
      '%via%',
      '%via%',
      '%via%',
      'rilasciata',
      'sanatoria',
    ]);
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
