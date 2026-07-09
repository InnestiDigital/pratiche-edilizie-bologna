import { describe, it, expect } from 'vitest';
import { buildCiviciIndex, type CiviciRecord } from './geocode-civici';
import {
  normalizeStreetName,
  buildStreetIndex,
  resolveStreetCode,
  resolveAddressCoord,
  type StreetEntry,
} from './street-index';

/** A small street list as local edilizia rows would supply it (via + codvia). */
const ENTRIES: StreetEntry[] = [
  { via: 'VIA MARCONI', codvia: 100 },
  { via: "Via dell'Indipendenza", codvia: 200 },
  { via: 'Piazza Maggiore', codvia: 300 },
  { via: 'Via del 2 Agosto 1980', codvia: 400 },
];

describe('street-index — normalizeStreetName', () => {
  it('folds case, accents and punctuation to a stable key', () => {
    expect(normalizeStreetName('VIA MARCONI')).toBe('via marconi');
    expect(normalizeStreetName('  via   marconi ')).toBe('via marconi');
    expect(normalizeStreetName("Via dell'Indipendenza")).toBe('via dell indipendenza');
    expect(normalizeStreetName('Via San Vitàle')).toBe('via san vitale');
  });

  it('strips a TRAILING house number but keeps a number inside the name', () => {
    expect(normalizeStreetName('Via Marconi, 12')).toBe('via marconi');
    expect(normalizeStreetName('VIA MARCONI 12')).toBe('via marconi');
    expect(normalizeStreetName('Via Marconi 12A')).toBe('via marconi');
    // A number that is part of the name (not a trailing civic) survives.
    expect(normalizeStreetName('Via del 2 Agosto 1980')).toBe('via del 2 agosto');
  });

  it('returns empty string for input that canonicalizes to nothing', () => {
    expect(normalizeStreetName('')).toBe('');
    expect(normalizeStreetName('   ')).toBe('');
    expect(normalizeStreetName(',.- /')).toBe('');
    expect(normalizeStreetName('12')).toBe(''); // a bare civic number is not a street
  });
});

describe('street-index — buildStreetIndex', () => {
  it('indexes each street by its normalized name', () => {
    const index = buildStreetIndex(ENTRIES);
    expect(index.byName.get('via marconi')).toBe(100);
    expect(index.byName.get('via dell indipendenza')).toBe(200);
    expect(index.byName.get('piazza maggiore')).toBe(300);
    expect(index.byName.size).toBe(4);
  });

  it('exposes sorted, de-duplicated display names for the picker', () => {
    const index = buildStreetIndex(ENTRIES);
    expect(index.names).toEqual(
      ["Via dell'Indipendenza", 'Via del 2 Agosto 1980', 'VIA MARCONI', 'Piazza Maggiore'].sort(
        (a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' })
      )
    );
  });

  it('keeps the FIRST spelling and code on a duplicate normalized name', () => {
    const index = buildStreetIndex([
      { via: 'VIA MARCONI', codvia: 100 },
      { via: 'via marconi', codvia: 999 }, // same street, noisy later duplicate
      { via: 'Via Marconi, 5', codvia: 888 },
    ]);
    expect(index.byName.get('via marconi')).toBe(100); // first code wins
    expect(index.byName.size).toBe(1);
    expect(index.names).toEqual(['VIA MARCONI']); // first spelling shown
  });

  it('drops entries with an invalid codvia or an empty name', () => {
    const index = buildStreetIndex([
      { via: 'Via A', codvia: 1 },
      { via: 'Via B', codvia: NaN },
      { via: 'Via C', codvia: -5 },
      { via: 'Via D', codvia: 3.5 },
      { via: '  ,. ', codvia: 7 }, // canonicalizes to '' → dropped
    ]);
    expect(index.byName.size).toBe(1);
    expect(index.byName.get('via a')).toBe(1);
  });
});

describe('street-index — resolveStreetCode', () => {
  const index = buildStreetIndex(ENTRIES);

  it('resolves a picked/typed street regardless of case, accents or a civic suffix', () => {
    expect(resolveStreetCode(index, 'via marconi')).toBe(100);
    expect(resolveStreetCode(index, 'VIA MARCONI')).toBe(100);
    expect(resolveStreetCode(index, 'Via Marconi, 12')).toBe(100);
    expect(resolveStreetCode(index, "Via dell'Indipendenza")).toBe(200);
  });

  it('returns null for an unknown street or empty input — never a nearest guess', () => {
    expect(resolveStreetCode(index, 'Via Sconosciuta')).toBeNull();
    expect(resolveStreetCode(index, 'marconi')).toBeNull(); // no prefix → not the same key
    expect(resolveStreetCode(index, '')).toBeNull();
    expect(resolveStreetCode(index, null)).toBeNull();
    expect(resolveStreetCode(index, undefined)).toBeNull();
  });
});

describe('street-index — resolveAddressCoord', () => {
  const streetIndex = buildStreetIndex(ENTRIES);
  const CIVICI: CiviciRecord[] = [
    { codvia: 100, civico: 2, lat: 44.4939, lon: 11.3428 },
    { codvia: 100, civico: 4, lat: 44.4941, lon: 11.343 },
    { codvia: 300, civico: 1, lat: 44.4938, lon: 11.3426 },
  ];
  const civiciIndex = buildCiviciIndex(CIVICI);

  it('resolves a full address to the exact civic coordinate', () => {
    expect(resolveAddressCoord(streetIndex, civiciIndex, 'Via Marconi', 2)).toEqual({
      lat: 44.4939,
      lon: 11.3428,
    });
  });

  it('falls back to the street centroid when the civic number is missing/unmatched', () => {
    // No civico → street 100 centroid (mean of civici 2 and 4).
    const c = resolveAddressCoord(streetIndex, civiciIndex, 'Via Marconi', null);
    expect(c!.lat).toBeCloseTo(44.494, 6);
    expect(c!.lon).toBeCloseTo(11.3429, 6);
    // A civic number the street doesn't have also falls back to the centroid.
    expect(resolveAddressCoord(streetIndex, civiciIndex, 'Via Marconi', 999)).toEqual(c);
  });

  it('returns null when the street is unknown or has no civici at all', () => {
    expect(resolveAddressCoord(streetIndex, civiciIndex, 'Via Sconosciuta', 1)).toBeNull();
    // Street 200 is known to the street index but has no civic points → null.
    expect(resolveAddressCoord(streetIndex, civiciIndex, "Via dell'Indipendenza", 1)).toBeNull();
  });
});
