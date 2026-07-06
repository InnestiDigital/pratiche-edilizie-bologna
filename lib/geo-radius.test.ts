import { describe, it, expect } from 'vitest';
import { sanitizeRadiusMeters, isWithinRadius, filterWithinRadius } from './geo-radius';
import type { Coords } from './permit-extra';

const HOME: Coords = { lat: 44.4949, lon: 11.3426 };
const NEAR: Coords = { lat: 44.4944, lon: 11.3466 }; // ~320 m away
const FAR: Coords = { lat: 44.5149, lon: 11.3426 }; // ~2.2 km N

describe('sanitizeRadiusMeters', () => {
  it('passes a finite non-negative radius through', () => {
    expect(sanitizeRadiusMeters(300)).toBe(300);
    expect(sanitizeRadiusMeters(0)).toBe(0);
  });

  it('collapses negative to 0', () => {
    expect(sanitizeRadiusMeters(-500)).toBe(0);
  });

  it('collapses NaN to 0', () => {
    expect(sanitizeRadiusMeters(NaN)).toBe(0);
  });

  it('collapses Infinity to 0 (never a match-everything escape hatch)', () => {
    expect(sanitizeRadiusMeters(Infinity)).toBe(0);
    expect(sanitizeRadiusMeters(-Infinity)).toBe(0);
  });
});

describe('isWithinRadius', () => {
  it('is true for a point inside the radius', () => {
    expect(isWithinRadius(HOME, NEAR, 500)).toBe(true);
  });

  it('is false for a point outside the radius', () => {
    expect(isWithinRadius(HOME, FAR, 500)).toBe(false);
  });

  it('includes the boundary (<= is inclusive)', () => {
    // same point, radius 0 → distance 0 <= 0
    expect(isWithinRadius(HOME, HOME, 0)).toBe(true);
  });

  it('a garbage radius (negative) matches only the exact home point', () => {
    expect(isWithinRadius(HOME, HOME, -1)).toBe(true);
    expect(isWithinRadius(HOME, NEAR, -1)).toBe(false);
  });

  it('Infinity radius does NOT match a distant point (sanitised to 0)', () => {
    expect(isWithinRadius(HOME, FAR, Infinity)).toBe(false);
  });
});

interface Row {
  id: string;
  coord: Coords | null;
}

const getCoord = (r: Row): Coords | null => r.coord;

describe('filterWithinRadius', () => {
  const rows: Row[] = [
    { id: 'near', coord: NEAR },
    { id: 'far', coord: FAR },
    { id: 'nocoord', coord: null },
    { id: 'home', coord: HOME },
  ];

  it('keeps only rows within the radius, preserving order', () => {
    const kept = filterWithinRadius(HOME, 500, rows, getCoord).map((r) => r.id);
    expect(kept).toEqual(['near', 'home']);
  });

  it('excludes null-coord rows', () => {
    const kept = filterWithinRadius(HOME, 10_000, rows, getCoord).map((r) => r.id);
    expect(kept).not.toContain('nocoord');
  });

  it('with a wide radius keeps every coord-bearing row', () => {
    const kept = filterWithinRadius(HOME, 5_000, rows, getCoord).map((r) => r.id);
    expect(kept).toEqual(['near', 'far', 'home']);
  });

  it('a sanitised (Infinity) radius keeps only the exact home point', () => {
    const kept = filterWithinRadius(HOME, Infinity, rows, getCoord).map((r) => r.id);
    expect(kept).toEqual(['home']);
  });

  it('a negative radius keeps only the exact home point', () => {
    const kept = filterWithinRadius(HOME, -300, rows, getCoord).map((r) => r.id);
    expect(kept).toEqual(['home']);
  });

  it('returns an empty array for no items', () => {
    expect(filterWithinRadius(HOME, 500, [], getCoord)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    filterWithinRadius(HOME, 500, rows, getCoord);
    expect(rows).toEqual(copy);
  });
});
