import { describe, it, expect } from 'vitest';
import type { Coords } from './permit-extra';
import type { HomeLocation } from './home-location';
import { homeDistanceMeters, formatDistanceApprox, distanceLabelFromHome } from './home-distance';

const HOME: HomeLocation = { coords: { lat: 44.4949, lon: 11.3426 }, label: 'Via Rizzoli 1' };

describe('homeDistanceMeters', () => {
  it('is 0 for the home point itself', () => {
    expect(homeDistanceMeters(HOME, HOME.coords)).toBe(0);
  });

  it('grows monotonically as a point moves away from home', () => {
    const near: Coords = { lat: 44.4955, lon: 11.3426 }; // ~67 m north
    const far: Coords = { lat: 44.5049, lon: 11.3426 }; // ~1.1 km north
    const dNear = homeDistanceMeters(HOME, near);
    const dFar = homeDistanceMeters(HOME, far);
    expect(dNear).toBeGreaterThan(0);
    expect(dFar).toBeGreaterThan(dNear);
  });

  it('matches a known ~1.11 km meridian step (0.01° latitude)', () => {
    const km: Coords = { lat: 44.5049, lon: 11.3426 };
    // 0.01° of latitude ≈ 1.11 km anywhere on Earth.
    expect(homeDistanceMeters(HOME, km)).toBeGreaterThan(1050);
    expect(homeDistanceMeters(HOME, km)).toBeLessThan(1170);
  });
});

describe('formatDistanceApprox', () => {
  it('rounds sub-kilometre distances to the nearest 10 m', () => {
    expect(formatDistanceApprox(347)).toBe('~350 m');
    expect(formatDistanceApprox(344)).toBe('~340 m');
    expect(formatDistanceApprox(67)).toBe('~70 m');
  });

  it('floors at 10 m so a permit on the doorstep never reads below it', () => {
    expect(formatDistanceApprox(0)).toBe('~10 m');
    expect(formatDistanceApprox(3)).toBe('~10 m');
  });

  it('switches to kilometres at/above 1 km, one decimal, Italian comma', () => {
    expect(formatDistanceApprox(1234)).toBe('~1,2 km');
    expect(formatDistanceApprox(1500)).toBe('~1,5 km');
  });

  it('drops a trailing ",0" so a whole-kilometre value reads clean', () => {
    expect(formatDistanceApprox(2000)).toBe('~2 km');
    expect(formatDistanceApprox(1970)).toBe('~2 km');
  });

  it('rounds up to km at the [995,1000) boundary, never the contradictory "~1000 m"', () => {
    expect(formatDistanceApprox(995)).toBe('~1 km');
    expect(formatDistanceApprox(997)).toBe('~1 km');
    expect(formatDistanceApprox(999.9)).toBe('~1 km');
    // just below the round-up threshold stays in metres
    expect(formatDistanceApprox(994)).toBe('~990 m');
  });

  it('sanitises non-finite / negative input to the 10 m floor', () => {
    expect(formatDistanceApprox(NaN)).toBe('~10 m');
    expect(formatDistanceApprox(Infinity)).toBe('~10 m');
    expect(formatDistanceApprox(-5)).toBe('~10 m');
  });
});

describe('distanceLabelFromHome', () => {
  it('labels a coordinate by its distance from home', () => {
    expect(distanceLabelFromHome(HOME, HOME.coords)).toBe('~10 m');
    expect(distanceLabelFromHome(HOME, { lat: 44.5049, lon: 11.3426 })).toBe('~1,1 km');
  });

  it('returns null for an absent coordinate (renders no chip)', () => {
    expect(distanceLabelFromHome(HOME, null)).toBeNull();
  });
});
