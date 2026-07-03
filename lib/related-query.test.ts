import { describe, it, expect } from 'vitest';
import { buildRelatedPermitsQuery, RELATED_PERMITS_LIMIT } from './related-query';

describe('buildRelatedPermitsQuery', () => {
  it('filters by zone, excludes the current permit, and orders by recency', () => {
    const { sql } = buildRelatedPermitsQuery('Porto-Saragozza', 1);
    expect(sql).toContain('WHERE zone = ? AND id != ?');
    expect(sql).toContain('ORDER BY COALESCE(date_issued, source_updated_at, first_seen_at) DESC');
    expect(sql).toContain('LIMIT ?');
  });

  it('binds params in [zone, excludeId, limit] order', () => {
    const { params } = buildRelatedPermitsQuery('Savena', 42, 5);
    expect(params).toEqual(['Savena', 42, 5]);
  });

  it('defaults the limit to RELATED_PERMITS_LIMIT', () => {
    const { params } = buildRelatedPermitsQuery('Navile', 7);
    expect(params[2]).toBe(RELATED_PERMITS_LIMIT);
  });

  it('clamps a fractional limit down to a whole number', () => {
    const { params } = buildRelatedPermitsQuery('Navile', 7, 2.9);
    expect(params[2]).toBe(2);
  });

  it('falls back to the default for a zero, negative, or non-finite limit', () => {
    expect(buildRelatedPermitsQuery('Navile', 7, 0).params[2]).toBe(RELATED_PERMITS_LIMIT);
    expect(buildRelatedPermitsQuery('Navile', 7, -3).params[2]).toBe(RELATED_PERMITS_LIMIT);
    expect(buildRelatedPermitsQuery('Navile', 7, NaN).params[2]).toBe(RELATED_PERMITS_LIMIT);
    expect(buildRelatedPermitsQuery('Navile', 7, Infinity).params[2]).toBe(RELATED_PERMITS_LIMIT);
  });
});
