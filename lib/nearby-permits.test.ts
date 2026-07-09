import { describe, it, expect } from 'vitest';
import {
  rankNearby,
  formatNearbyDistance,
  NEARBY_DEFAULT_RADIUS_M,
  NEARBY_LIMIT,
} from './nearby-permits';
import type { Coords } from './permit-extra';

// A small cluster around Via Stalingrado, Bologna (the origin).
const ORIGIN: Coords = { lat: 44.5236, lon: 11.361 };

interface Row {
  id: number;
  coords: Coords | null;
}

const rows = (...rs: Row[]) => rs;
const getId = (r: Row) => r.id;
const getCoord = (r: Row) => r.coords;

const rank = (items: Row[], radius?: number, limit?: number) =>
  rankNearby(ORIGIN, 1, items, getId, getCoord, radius, limit).map((r) => r.item.id);

describe('rankNearby', () => {
  it('returns [] for an empty candidate set', () => {
    expect(rankNearby(ORIGIN, 1, [], getId, getCoord)).toEqual([]);
  });

  it('orders neighbours nearest-first', () => {
    const near: Coords = { lat: 44.5215, lon: 11.3585 }; // ~305 m
    const nearer: Coords = { lat: 44.5245, lon: 11.3618 }; // ~120 m
    expect(rank(rows({ id: 2, coords: near }, { id: 3, coords: nearer }))).toEqual([3, 2]);
  });

  it('excludes candidates beyond the radius', () => {
    const far: Coords = { lat: 44.5075, lon: 11.3665 }; // ~1.9 km (Fiera)
    expect(rank(rows({ id: 2, coords: far }))).toEqual([]);
  });

  it('drops all candidates when none are in range', () => {
    const far1: Coords = { lat: 44.4938, lon: 11.3426 }; // Piazza Maggiore, ~3.4 km
    const far2: Coords = { lat: 44.494, lon: 11.343 };
    expect(rank(rows({ id: 2, coords: far1 }, { id: 3, coords: far2 }))).toEqual([]);
  });

  it('excludes candidates with a null coordinate (e.g. edilizia)', () => {
    const near: Coords = { lat: 44.5245, lon: 11.3618 };
    expect(rank(rows({ id: 2, coords: null }, { id: 3, coords: near }))).toEqual([3]);
  });

  it('excludes the origin itself by id, even at distance 0', () => {
    expect(rank(rows({ id: 1, coords: ORIGIN }))).toEqual([]);
  });

  it('breaks distance ties by id ascending (deterministic)', () => {
    const same: Coords = { lat: 44.5245, lon: 11.3618 };
    expect(rank(rows({ id: 5, coords: same }, { id: 2, coords: same }))).toEqual([2, 5]);
  });

  it('caps the result at the limit, keeping the nearest', () => {
    const a: Coords = { lat: 44.5245, lon: 11.3618 }; // ~120 m
    const b: Coords = { lat: 44.5215, lon: 11.3585 }; // ~305 m
    const c: Coords = { lat: 44.5225, lon: 11.3565 }; // ~370 m
    expect(
      rank(rows({ id: 2, coords: c }, { id: 3, coords: a }, { id: 4, coords: b }), 500, 2)
    ).toEqual([3, 4]);
  });

  it('sanitizes a non-finite/negative radius to 0 (only an exact hit qualifies)', () => {
    const onPoint: Coords = { lat: 44.5236, lon: 11.361 };
    const near: Coords = { lat: 44.5245, lon: 11.3618 };
    expect(rank(rows({ id: 2, coords: onPoint }, { id: 3, coords: near }), -1)).toEqual([2]);
    expect(rank(rows({ id: 2, coords: onPoint }, { id: 3, coords: near }), NaN)).toEqual([2]);
    expect(rank(rows({ id: 2, coords: onPoint }, { id: 3, coords: near }), Infinity)).toEqual([2]);
  });

  it('falls back to the default limit for a junk limit value', () => {
    const near: Coords = { lat: 44.5245, lon: 11.3618 };
    const many = Array.from({ length: NEARBY_LIMIT + 3 }, (_, i) => ({ id: i + 2, coords: near }));
    expect(rank(many, NEARBY_DEFAULT_RADIUS_M, NaN)).toHaveLength(NEARBY_LIMIT);
    expect(rank(many, NEARBY_DEFAULT_RADIUS_M, -5)).toHaveLength(NEARBY_LIMIT);
  });
});

describe('formatNearbyDistance', () => {
  it('rounds sub-km distances to the nearest 10 m', () => {
    expect(formatNearbyDistance(120)).toBe('~120 m');
    expect(formatNearbyDistance(305)).toBe('~310 m');
    expect(formatNearbyDistance(378)).toBe('~380 m');
    expect(formatNearbyDistance(4)).toBe('~0 m');
  });

  it('formats km with an Italian decimal comma at/above 1 km', () => {
    expect(formatNearbyDistance(1000)).toBe('~1,0 km');
    expect(formatNearbyDistance(1234)).toBe('~1,2 km');
    expect(formatNearbyDistance(2950)).toBe('~3,0 km');
  });

  it('promotes a sub-km value that rounds up to 1000 into the km label', () => {
    // [995, 1000) rounds to 1000 m; it must read "~1,0 km", not "~1000 m".
    expect(formatNearbyDistance(995)).toBe('~1,0 km');
    expect(formatNearbyDistance(997)).toBe('~1,0 km');
    expect(formatNearbyDistance(999.9)).toBe('~1,0 km');
    // Just below the round-up threshold stays a metre label.
    expect(formatNearbyDistance(994)).toBe('~990 m');
  });

  it('clamps a junk distance to 0 m instead of rendering NaN', () => {
    expect(formatNearbyDistance(NaN)).toBe('~0 m');
    expect(formatNearbyDistance(-50)).toBe('~0 m');
    expect(formatNearbyDistance(Infinity)).toBe('~0 m');
  });
});
