import { describe, it, expect } from 'vitest';
import { normalizeQuartiere } from './quartiere-normalize';
import { QUARTIERI } from './constants';

describe('normalizeQuartiere', () => {
  it('round-trips every canonical QUARTIERI member unchanged', () => {
    for (const q of QUARTIERI) {
      expect(normalizeQuartiere(q)).toBe(q);
    }
  });

  it('maps the spaced-hyphen ODS spellings to the tight canonical form', () => {
    expect(normalizeQuartiere('San Donato - San Vitale')).toBe('San Donato-San Vitale');
    expect(normalizeQuartiere('Porto - Saragozza')).toBe('Porto-Saragozza');
    expect(normalizeQuartiere('Borgo Panigale - Reno')).toBe('Borgo Panigale-Reno');
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(normalizeQuartiere('  navile  ')).toBe('Navile');
    expect(normalizeQuartiere('SAN DONATO-SAN VITALE')).toBe('San Donato-San Vitale');
    expect(normalizeQuartiere('porto  -  saragozza')).toBe('Porto-Saragozza');
  });

  it('returns null for null/undefined/empty/unknown input', () => {
    expect(normalizeQuartiere(null)).toBeNull();
    expect(normalizeQuartiere(undefined)).toBeNull();
    expect(normalizeQuartiere('')).toBeNull();
    expect(normalizeQuartiere('Quartiere Inesistente')).toBeNull();
  });
});
