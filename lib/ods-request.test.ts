import { describe, it, expect } from 'vitest';
import { DATASETS, BOLOGNA_API_BASE, API_LIMIT } from './constants';
import {
  buildOdsUrl,
  buildPageParams,
  buildDateRangeWhere,
  buildSinceWhere,
  YEAR_REFINE_FIELD,
} from './ods-request';

describe('buildOdsUrl', () => {
  it('fills the {slug} template with each dataset slug', () => {
    expect(buildOdsUrl('pdc')).toBe(BOLOGNA_API_BASE.replace('{slug}', DATASETS.pdc.slug));
    expect(buildOdsUrl('scia')).toBe(BOLOGNA_API_BASE.replace('{slug}', DATASETS.scia.slug));
    expect(buildOdsUrl('cila')).toBe(BOLOGNA_API_BASE.replace('{slug}', DATASETS.cila.slug));
  });

  it('leaves no {slug} placeholder behind and embeds the real slug', () => {
    const url = buildOdsUrl('scia');
    expect(url).not.toContain('{slug}');
    expect(url).toContain(DATASETS.scia.slug);
  });
});

describe('buildPageParams', () => {
  it('defaults limit to API_LIMIT and stringifies offset', () => {
    expect(buildPageParams({ offset: 0 })).toEqual({
      limit: String(API_LIMIT),
      offset: '0',
    });
  });

  it('honors an explicit limit', () => {
    expect(buildPageParams({ offset: 200, limit: 50 })).toEqual({
      limit: '50',
      offset: '200',
    });
  });

  it('produces the single-record count-probe shape (no refine, no where)', () => {
    // The full-scan count probe reuses buildPageParams unconditionally: with no
    // year and no where, it is exactly { limit: '1', offset: '0' } (there is no
    // dedicated probe builder — one code path).
    const params = buildPageParams({ offset: 0, limit: 1 });
    expect(params).toEqual({ limit: '1', offset: '0' });
    expect(params).not.toHaveProperty('refine');
    expect(params).not.toHaveProperty('where');
  });

  it('adds the year refine using the ODS refine field contract', () => {
    expect(buildPageParams({ offset: 0, year: 2024 })).toEqual({
      limit: String(API_LIMIT),
      offset: '0',
      refine: `${YEAR_REFINE_FIELD}:2024`,
    });
    // Lock the exact wire string — a typo here silently returns unrefined data.
    expect(buildPageParams({ offset: 0, year: 2024 }).refine).toBe('richiesta_anno_prot:2024');
  });

  it('omits refine entirely when no year is given', () => {
    expect(buildPageParams({ offset: 0 })).not.toHaveProperty('refine');
  });

  it('passes a where clause through verbatim', () => {
    const where = "data_richiesta>=date'2023-01-01' AND data_richiesta<date'2024-01-01'";
    expect(buildPageParams({ offset: 0, where })).toEqual({
      limit: String(API_LIMIT),
      offset: '0',
      where,
    });
  });

  it('omits where entirely when none is given', () => {
    expect(buildPageParams({ offset: 0 })).not.toHaveProperty('where');
  });

  it('produces a well-formed query string via URLSearchParams (year encoded)', () => {
    const qs = new URLSearchParams(buildPageParams({ offset: 100, year: 2023 })).toString();
    expect(qs).toBe('limit=100&offset=100&refine=richiesta_anno_prot%3A2023');
  });

  it('rejects a non-integer or negative offset', () => {
    expect(() => buildPageParams({ offset: -1 })).toThrow(RangeError);
    expect(() => buildPageParams({ offset: 1.5 })).toThrow(RangeError);
    expect(() => buildPageParams({ offset: NaN })).toThrow(RangeError);
  });

  it('rejects a non-positive or non-integer limit', () => {
    expect(() => buildPageParams({ offset: 0, limit: 0 })).toThrow(RangeError);
    expect(() => buildPageParams({ offset: 0, limit: -10 })).toThrow(RangeError);
    expect(() => buildPageParams({ offset: 0, limit: 2.5 })).toThrow(RangeError);
  });

  it('rejects a non-integer or negative year', () => {
    expect(() => buildPageParams({ offset: 0, year: -2024 })).toThrow(RangeError);
    expect(() => buildPageParams({ offset: 0, year: 2024.5 })).toThrow(RangeError);
    expect(() => buildPageParams({ offset: 0, year: NaN })).toThrow(RangeError);
  });
});

describe('buildDateRangeWhere', () => {
  it('builds a half-open ODS-QL date range with date literals', () => {
    expect(buildDateRangeWhere('data_richiesta', '2023-01-01', '2024-01-01')).toBe(
      "data_richiesta>=date'2023-01-01' AND data_richiesta<date'2024-01-01'"
    );
  });

  it('is URL-encodable into a well-formed where param', () => {
    const where = buildDateRangeWhere('data_inserimento', '2024-01-01', '2024-02-01');
    const qs = new URLSearchParams(buildPageParams({ offset: 0, where })).toString();
    expect(qs).toBe(
      'limit=100&offset=0&where=data_inserimento%3E%3Ddate%272024-01-01%27+AND+data_inserimento%3Cdate%272024-02-01%27'
    );
  });

  it('rejects bounds that are not YYYY-MM-DD dates', () => {
    expect(() => buildDateRangeWhere('f', '2023', '2024-01-01')).toThrow(RangeError);
    expect(() => buildDateRangeWhere('f', '2023-01-01', '2024')).toThrow(RangeError);
    expect(() => buildDateRangeWhere('f', "2023-01-01' OR 1=1", '2024-01-01')).toThrow(RangeError);
  });
});

describe('buildSinceWhere', () => {
  it('builds an open-ended ODS-QL "since" clause with a date literal', () => {
    expect(buildSinceWhere('start', '2026-06-28')).toBe("start>=date'2026-06-28'");
  });

  it('is URL-encodable into a well-formed where param', () => {
    const where = buildSinceWhere('start', '2026-06-28');
    const qs = new URLSearchParams(buildPageParams({ offset: 0, where })).toString();
    expect(qs).toBe('limit=100&offset=0&where=start%3E%3Ddate%272026-06-28%27');
  });

  it('rejects a bound that is not a YYYY-MM-DD date', () => {
    expect(() => buildSinceWhere('start', '2026')).toThrow(RangeError);
    expect(() => buildSinceWhere('start', "2026-06-28' OR 1=1")).toThrow(RangeError);
  });
});
