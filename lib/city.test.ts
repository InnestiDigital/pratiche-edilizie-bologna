import { describe, it, expect } from 'vitest';
import { CITY } from './city';
import { buildMapsQuery } from './maps-url';

describe('CITY config', () => {
  it('models the active city (Bologna) as data, not brand', () => {
    expect(CITY.name).toBe('Bologna');
    expect(CITY.provider).toBe('Comune di Bologna');
    expect(CITY.geocodeRegion).toBe('Bologna, Italia');
    expect(CITY.accent).toBe('#9B2335');
  });

  it('has no empty fields (a city must be fully specified)', () => {
    for (const value of Object.values(CITY)) {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('accent is a 6-digit hex colour', () => {
    expect(CITY.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('drives the geocode anchor (maps query ends with CITY.geocodeRegion)', () => {
    // The rebrand seam: the map query must read its region suffix from the city
    // config, not a hardcoded string — so a second city varies by config alone.
    expect(buildMapsQuery('Via Marconi 24')).toBe(`Via Marconi 24, ${CITY.geocodeRegion}`);
  });
});
