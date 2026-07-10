import { describe, it, expect } from 'vitest';
import { haversineMeters, formatApproxDistance } from './geo-distance';
import type { Coords } from './permit-extra';

const BOLOGNA: Coords = { lat: 44.4949, lon: 11.3426 }; // Piazza Maggiore-ish
const DUE_TORRI: Coords = { lat: 44.4944, lon: 11.3466 }; // ~320 m E of the square

describe('haversineMeters', () => {
  it('is 0 for the same point', () => {
    expect(haversineMeters(BOLOGNA, BOLOGNA)).toBe(0);
  });

  it('is 0 for two coincident coordinates', () => {
    expect(haversineMeters({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineMeters(BOLOGNA, DUE_TORRI)).toBeCloseTo(haversineMeters(DUE_TORRI, BOLOGNA), 6);
  });

  it('matches a known short city distance (~320 m)', () => {
    const d = haversineMeters(BOLOGNA, DUE_TORRI);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(340);
  });

  it('computes ~111.2 km per degree of latitude at the equator', () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('returns a finite, near-half-circumference value for antipodes (no NaN)', () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(Number.isFinite(d)).toBe(true);
    // half the great circle ≈ π · R ≈ 20 015 km
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_040_000);
  });

  it('handles pole-to-pole antipodes without NaN', () => {
    const d = haversineMeters({ lat: 90, lon: 0 }, { lat: -90, lon: 0 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(20_000_000);
  });

  it('is unaffected by longitude at the poles', () => {
    const d = haversineMeters({ lat: 90, lon: 0 }, { lat: 90, lon: 120 });
    expect(d).toBeCloseTo(0, 3);
  });

  it('handles the antimeridian: 179° vs -179° is a short hop, not a world away', () => {
    const d = haversineMeters({ lat: 0, lon: 179 }, { lat: 0, lon: -179 });
    // 2° of longitude at the equator ≈ 222 km, NOT 358° worth
    expect(d).toBeGreaterThan(220_000);
    expect(d).toBeLessThan(224_000);
  });
});

describe('formatApproxDistance', () => {
  it('rounds sub-km distances to the nearest 10 m, never below the 10 m floor', () => {
    expect(formatApproxDistance(347)).toBe('~350 m');
    expect(formatApproxDistance(344)).toBe('~340 m');
    expect(formatApproxDistance(4)).toBe('~10 m');
    expect(formatApproxDistance(0)).toBe('~10 m');
  });

  it('formats km with an Italian comma, a whole value dropping its ",0"', () => {
    expect(formatApproxDistance(1234)).toBe('~1,2 km');
    expect(formatApproxDistance(1500)).toBe('~1,5 km');
    expect(formatApproxDistance(2000)).toBe('~2 km');
    expect(formatApproxDistance(1970)).toBe('~2 km');
  });

  it('promotes a value that rounds up to 1000 m into the km label', () => {
    // [995, 1000) rounds to 1000 m; must read "~1 km", not "~1000 m".
    expect(formatApproxDistance(995)).toBe('~1 km');
    expect(formatApproxDistance(999.9)).toBe('~1 km');
    expect(formatApproxDistance(994)).toBe('~990 m');
  });

  it('floors non-finite / non-positive input to "~10 m" instead of NaN', () => {
    expect(formatApproxDistance(NaN)).toBe('~10 m');
    expect(formatApproxDistance(Infinity)).toBe('~10 m');
    expect(formatApproxDistance(-5)).toBe('~10 m');
  });
});
