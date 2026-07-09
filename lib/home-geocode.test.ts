import { describe, it, expect } from 'vitest';
import { resolveAddressToHome } from './home-geocode';
import { buildStreetIndex, type StreetEntry } from './street-index';
import type { CiviciBatchFetcher } from './civici-sync';
import type { CiviciRecord } from './geocode-civici';

/** A local street list as `getEdiliziaStreets` would supply it (clean via + codvia). */
const ENTRIES: StreetEntry[] = [
  { via: 'Via Marconi', codvia: 100 },
  { via: 'Piazza Maggiore', codvia: 300 },
];
const STREET_INDEX = buildStreetIndex(ENTRIES);
const EMPTY_INDEX = buildStreetIndex([]);

/** Gazetteer points for codvia 100: civic 12 exact, plus a second for a centroid. */
const CIVICI_100: CiviciRecord[] = [
  { codvia: 100, civico: 12, lat: 44.4949, lon: 11.3426 },
  { codvia: 100, civico: 20, lat: 44.4951, lon: 11.343 },
];

/** A fetcher returning fixed records + recording the `where` clauses it saw. */
function makeFetcher(records: CiviciRecord[]) {
  const wheres: string[] = [];
  const fetchBatch: CiviciBatchFetcher = async (where) => {
    wheres.push(where);
    return records;
  };
  return { fetchBatch, wheres };
}

describe('home-geocode — resolveAddressToHome', () => {
  it('resolves a picked street + civic to a home at the exact civic point', async () => {
    const { fetchBatch, wheres } = makeFetcher(CIVICI_100);
    const res = await resolveAddressToHome(STREET_INDEX, 'Via Marconi', '12', fetchBatch);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.home.coords).toEqual({ lat: 44.4949, lon: 11.3426 });
    expect(res.home.label).toBe('Via Marconi 12');
    // Only the picked street's civici were fetched (scoped where clause).
    expect(wheres).toHaveLength(1);
    expect(wheres[0]).toContain('100');
  });

  it('falls back to the street centroid at street level (no civic)', async () => {
    const { fetchBatch } = makeFetcher(CIVICI_100);
    const res = await resolveAddressToHome(STREET_INDEX, 'Via Marconi', '', fetchBatch);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.home.coords.lat).toBeCloseTo(44.495, 4);
    expect(res.home.label).toBe('Via Marconi');
  });

  it('is normalized-exact: a differently-cased/spaced pick still resolves', async () => {
    const { fetchBatch } = makeFetcher(CIVICI_100);
    const res = await resolveAddressToHome(STREET_INDEX, '  via   marconi ', '12', fetchBatch);
    expect(res.kind).toBe('ok');
  });

  it('returns empty-index when no streets are known locally', async () => {
    const { fetchBatch, wheres } = makeFetcher(CIVICI_100);
    const res = await resolveAddressToHome(EMPTY_INDEX, 'Via Marconi', '12', fetchBatch);
    expect(res.kind).toBe('empty-index');
    expect(wheres).toHaveLength(0); // never fetched
  });

  it('returns unknown-street for a street not in the local index', async () => {
    const { fetchBatch, wheres } = makeFetcher(CIVICI_100);
    const res = await resolveAddressToHome(STREET_INDEX, 'Via Che Non Esiste', '1', fetchBatch);
    expect(res.kind).toBe('unknown-street');
    expect(wheres).toHaveLength(0); // never fetched
  });

  it('returns no-coordinate when the gazetteer had no point for the street', async () => {
    const { fetchBatch } = makeFetcher([]); // fetch succeeds but is empty
    const res = await resolveAddressToHome(STREET_INDEX, 'Via Marconi', '12', fetchBatch);
    expect(res.kind).toBe('no-coordinate');
  });

  it('returns fetch-failed when the live gazetteer fetch throws', async () => {
    const fetchBatch: CiviciBatchFetcher = async () => {
      throw new Error('offline');
    };
    const res = await resolveAddressToHome(STREET_INDEX, 'Via Marconi', '12', fetchBatch);
    expect(res.kind).toBe('fetch-failed');
  });
});
