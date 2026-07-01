import { describe, it, expect } from 'vitest';
import { DATASETS, BOLOGNA_API_BASE, API_LIMIT } from './constants';
import {
  buildOdsUrl,
  buildPageParams,
  buildCountProbeParams,
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

describe('buildCountProbeParams', () => {
  it('requests a single record at offset 0 (probe for total_count only)', () => {
    expect(buildCountProbeParams()).toEqual({ limit: '1', offset: '0' });
  });

  it('carries no refine so the count reflects the whole dataset', () => {
    expect(buildCountProbeParams()).not.toHaveProperty('refine');
  });
});
