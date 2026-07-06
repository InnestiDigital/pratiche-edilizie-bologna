import { describe, it, expect } from 'vitest';
import { haversineMeters } from './geo-distance';
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
