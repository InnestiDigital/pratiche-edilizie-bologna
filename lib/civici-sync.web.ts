/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * `civici-sync.ts` walks the Bologna gazetteer over the network and writes back to
 * SQLite. For the web export we neither sync nor talk to the network: report an
 * inert "nothing geocoded" pass. Native + vitest use `civici-sync.ts`. The export
 * surface mirrors the native module (tsc guards drift).
 */
import type * as SQLite from 'expo-sqlite';
import type { CiviciRecord } from './geocode-civici';

export const CIVICI_SLUG = 'rifter_civici_pt';

export type CiviciBatchFetcher = (
  where: string,
  onProgress?: (msg: string) => void
) => Promise<CiviciRecord[]>;

export interface CiviciBackfillSummary {
  candidates: number;
  fetched: number;
  geocoded: number;
  alreadyCoded: number;
  unresolved: number;
}

export function defaultCiviciBatchFetcher(
  _where: string,
  _onProgress?: (msg: string) => void
): Promise<CiviciRecord[]> {
  return Promise.resolve([]);
}

export function backfillEdiliziaCoords(
  _db: SQLite.SQLiteDatabase,
  _fetchBatch: CiviciBatchFetcher = defaultCiviciBatchFetcher,
  _onProgress?: (msg: string) => void
): Promise<CiviciBackfillSummary> {
  return Promise.resolve({
    candidates: 0,
    fetched: 0,
    geocoded: 0,
    alreadyCoded: 0,
    unresolved: 0,
  });
}
