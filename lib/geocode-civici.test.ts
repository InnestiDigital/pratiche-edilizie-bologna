import { describe, it, expect } from 'vitest';
import { buildCiviciIndex, geocodeCivico, type CiviciRecord } from './geocode-civici';

/** Two civic points on street 100 near Piazza Maggiore, one on street 200. */
const RECORDS: CiviciRecord[] = [
  { codvia: 100, civico: 2, lat: 44.4939, lon: 11.3428 },
  { codvia: 100, civico: 4, lat: 44.4941, lon: 11.343 },
  { codvia: 200, civico: 10, lat: 44.5, lon: 11.35 },
];

describe('geocode-civici — buildCiviciIndex', () => {
  it('indexes each valid civic point by codvia:civico', () => {
    const index = buildCiviciIndex(RECORDS);
    expect(index.byCivico.get('100:2')).toEqual({ lat: 44.4939, lon: 11.3428 });
    expect(index.byCivico.get('200:10')).toEqual({ lat: 44.5, lon: 11.35 });
    expect(index.byCivico.size).toBe(3);
  });

  it('computes a per-street centroid as the mean of its civic points', () => {
    const index = buildCiviciIndex(RECORDS);
    // Street 100: mean of (44.4939, 44.4941) and (11.3428, 11.343).
    const c = index.streetCentroid.get(100);
    expect(c!.lat).toBeCloseTo(44.494, 6);
    expect(c!.lon).toBeCloseTo(11.3429, 6);
    // Street 200: a single point → the point itself (exact, no averaging).
    expect(index.streetCentroid.get(200)).toEqual({ lat: 44.5, lon: 11.35 });
  });

  it('drops records with a non-finite key from both the exact map and the centroid', () => {
    const index = buildCiviciIndex([
      { codvia: NaN, civico: 1, lat: 44.5, lon: 11.3 },
      { codvia: 300, civico: Infinity, lat: 44.5, lon: 11.3 },
      { codvia: 300, civico: 5, lat: 44.6, lon: 11.4 },
    ]);
    expect(index.byCivico.size).toBe(1);
    expect(index.byCivico.get('300:5')).toEqual({ lat: 44.6, lon: 11.4 });
    // Only the finite-key point feeds street 300's centroid.
    expect(index.streetCentroid.get(300)).toEqual({ lat: 44.6, lon: 11.4 });
  });

  it('drops records with a non-finite or out-of-range coordinate', () => {
    const index = buildCiviciIndex([
      { codvia: 400, civico: 1, lat: NaN, lon: 11.3 },
      { codvia: 400, civico: 2, lat: 91, lon: 11.3 },
      { codvia: 400, civico: 3, lat: 44.5, lon: 181 },
      { codvia: 400, civico: 4, lat: 44.5, lon: 11.3 },
    ]);
    expect(index.byCivico.size).toBe(1);
    expect(index.byCivico.get('400:4')).toEqual({ lat: 44.5, lon: 11.3 });
    // A junk coordinate must not skew the centroid either.
    expect(index.streetCentroid.get(400)).toEqual({ lat: 44.5, lon: 11.3 });
  });

  it('keeps the FIRST record on a duplicate codvia:civico (deterministic)', () => {
    const index = buildCiviciIndex([
      { codvia: 500, civico: 1, lat: 44.5, lon: 11.3 },
      { codvia: 500, civico: 1, lat: 44.9, lon: 11.9 },
    ]);
    expect(index.byCivico.get('500:1')).toEqual({ lat: 44.5, lon: 11.3 });
    // Both duplicates still feed the centroid (mean of the two).
    const c = index.streetCentroid.get(500);
    expect(c!.lat).toBeCloseTo(44.7, 6);
    expect(c!.lon).toBeCloseTo(11.6, 6);
  });

  it('yields an empty index for no records', () => {
    const index = buildCiviciIndex([]);
    expect(index.byCivico.size).toBe(0);
    expect(index.streetCentroid.size).toBe(0);
  });
});

describe('geocode-civici — geocodeCivico', () => {
  const index = buildCiviciIndex(RECORDS);

  it('returns the exact coordinate for a known codvia+civico', () => {
    expect(geocodeCivico(index, 100, 4)).toEqual({ lat: 44.4941, lon: 11.343 });
  });

  it('falls back to the street centroid when the civic number is unmatched', () => {
    const c = geocodeCivico(index, 100, 999);
    expect(c!.lat).toBeCloseTo(44.494, 6);
    expect(c!.lon).toBeCloseTo(11.3429, 6);
  });

  it('uses the street centroid when the civic number is null (street, no number)', () => {
    const c = geocodeCivico(index, 100, null);
    expect(c!.lat).toBeCloseTo(44.494, 6);
    expect(c!.lon).toBeCloseTo(11.3429, 6);
    // Single-point street → the point itself, exact.
    expect(geocodeCivico(index, 200, undefined)).toEqual({ lat: 44.5, lon: 11.35 });
  });

  it('skips the exact lookup for a non-finite civic number and uses the centroid', () => {
    const c = geocodeCivico(index, 100, NaN);
    expect(c!.lat).toBeCloseTo(44.494, 6);
    expect(c!.lon).toBeCloseTo(11.3429, 6);
  });

  it('returns null for an unknown street', () => {
    expect(geocodeCivico(index, 9999, 1)).toBeNull();
  });

  it('returns null when codvia is null/undefined/non-finite (no street to resolve)', () => {
    expect(geocodeCivico(index, null, 4)).toBeNull();
    expect(geocodeCivico(index, undefined, 4)).toBeNull();
    expect(geocodeCivico(index, NaN, 4)).toBeNull();
  });

  it('returns null against an empty index', () => {
    expect(geocodeCivico(buildCiviciIndex([]), 100, 4)).toBeNull();
  });
});
