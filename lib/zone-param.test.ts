import { describe, it, expect } from 'vitest';
import { parseZoneParam } from './zone-param';
import { QUARTIERI } from './constants';

describe('parseZoneParam', () => {
  it('returns the zone for every canonical quartiere', () => {
    for (const zone of QUARTIERI) {
      expect(parseZoneParam(zone)).toBe(zone);
    }
  });

  it('accepts hyphenated / spaced quartiere names verbatim', () => {
    expect(parseZoneParam('Porto-Saragozza')).toBe('Porto-Saragozza');
    expect(parseZoneParam('San Donato-San Vitale')).toBe('San Donato-San Vitale');
  });

  it('normalizes the array form to its first element', () => {
    expect(parseZoneParam(['Savena', 'Navile'])).toBe('Savena');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseZoneParam('  Navile  ')).toBe('Navile');
  });

  it('returns null for undefined / empty / array-of-empty', () => {
    expect(parseZoneParam(undefined)).toBeNull();
    expect(parseZoneParam('')).toBeNull();
    expect(parseZoneParam([])).toBeNull();
  });

  it('returns null for an unknown or legacy zone name', () => {
    expect(parseZoneParam('San Vitale')).toBeNull();
    expect(parseZoneParam('Quartiere Inesistente')).toBeNull();
    expect(parseZoneParam('porto-saragozza')).toBeNull(); // case-sensitive on purpose
  });
});
