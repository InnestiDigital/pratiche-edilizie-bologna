import { describe, it, expect } from 'vitest';
import { extractStreetName } from './street-name';

describe('extractStreetName', () => {
  it('strips a plain trailing civic number', () => {
    expect(extractStreetName('Via Marconi 24')).toBe('Via Marconi');
    expect(extractStreetName('Via Andrea Costa 140')).toBe('Via Andrea Costa');
    expect(extractStreetName('Via Saragozza 118')).toBe('Via Saragozza');
  });

  it('keeps multi-word street names intact', () => {
    expect(extractStreetName('Piazza dei Martiri 1943-1945 6')).toBe(
      'Piazza dei Martiri 1943-1945'
    );
  });

  it('strips a civic number with a letter suffix (attached)', () => {
    expect(extractStreetName('Piazza Maggiore 6/A')).toBe('Piazza Maggiore');
    expect(extractStreetName('Via Zamboni 33B')).toBe('Via Zamboni');
  });

  it('strips a civic number with a lone-letter suffix token', () => {
    expect(extractStreetName('Via Marconi 24 A')).toBe('Via Marconi');
  });

  it('strips a civic range', () => {
    expect(extractStreetName('Via Saragozza 12-14')).toBe('Via Saragozza');
  });

  it('strips the "senza numero civico" (SNC) marker', () => {
    expect(extractStreetName('Via Emilia Levante SNC')).toBe('Via Emilia Levante');
    expect(extractStreetName('Via Emilia Levante s.n.c.')).toBe('Via Emilia Levante');
  });

  it('handles a comma between street and civic number', () => {
    expect(extractStreetName('Via Marconi, 24')).toBe('Via Marconi');
  });

  it('strips only ONE trailing civic token so a numeric street name survives', () => {
    // "Via 2 Agosto 1980" is a real Bologna street; the trailing "55" is the
    // civic — the street year must not be eaten.
    expect(extractStreetName('Via 2 Agosto 1980 55')).toBe('Via 2 Agosto 1980');
  });

  it('returns the whole thing when there is no civic number to strip', () => {
    expect(extractStreetName('Piazza Maggiore')).toBe('Piazza Maggiore');
  });

  it('returns null for empty, whitespace, or number-only input', () => {
    expect(extractStreetName('')).toBeNull();
    expect(extractStreetName('   ')).toBeNull();
    expect(extractStreetName('24')).toBeNull();
    expect(extractStreetName('24/A')).toBeNull();
  });

  it('returns null for null / undefined', () => {
    expect(extractStreetName(null)).toBeNull();
    expect(extractStreetName(undefined)).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(extractStreetName('  Via Marconi 24  ')).toBe('Via Marconi');
  });
});
