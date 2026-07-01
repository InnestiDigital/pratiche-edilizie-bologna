import * as SQLite from 'expo-sqlite';
import { DATASETS, API_LIMIT, type DatasetKey } from './constants';
import { normalizeRecord, type RawRecord } from './normalize';
import { fetchPage } from './fetch-page';
import { withRetry } from './retry';
import type { ParsedPage } from './schemas';
import { getDb } from './db';
import { classifyUpsert, type UpsertOutcome } from './upsert-classify';
import { tallyOutcomes } from './sync-tally';
import { walkPages, recentYears, fullScanYears, MAX_OFFSET } from './paginate';
import { buildOdsUrl, buildPageParams, buildCountProbeParams } from './ods-request';

/**
 * Fetch one page, retrying transient transport failures with backoff. A blip on
 * a single page of a multi-page walk must not abort the whole dataset sync; a
 * permanent failure (404/410, 4xx, bad shape) still fails fast. Retries are
 * surfaced through `onProgress` so a long sync doesn't look frozen.
 */
function fetchPageWithRetry(
  url: string,
  params: Record<string, string>,
  onProgress?: (msg: string) => void
): Promise<ParsedPage> {
  return withRetry(() => fetchPage(url, params), {
    onRetry: ({ attempt, delayMs, error }) =>
      onProgress?.(
        `Ritento (${attempt}) tra ${Math.round(delayMs)}ms — ` +
          `${error instanceof Error ? error.message : String(error)}`
      ),
  });
}

async function fetchDatasetRecent(
  datasetKey: DatasetKey,
  yearsBack = 2,
  onProgress?: (msg: string) => void
): Promise<RawRecord[]> {
  const url = buildOdsUrl(datasetKey);
  const currentYear = new Date().getFullYear();
  const allRecords: RawRecord[] = [];

  for (const year of recentYears(currentYear, yearsBack)) {
    const records = await walkPages<RawRecord>(
      (offset) => fetchPageWithRetry(url, buildPageParams({ offset, year }), onProgress),
      API_LIMIT
    );
    allRecords.push(...records);
  }
  return allRecords;
}

async function fetchDatasetFull(
  datasetKey: DatasetKey,
  onProgress?: (msg: string) => void
): Promise<RawRecord[]> {
  const url = buildOdsUrl(datasetKey);

  const { totalCount } = await fetchPageWithRetry(url, buildCountProbeParams(), onProgress);

  if (totalCount <= MAX_OFFSET) {
    return walkPages<RawRecord>(
      (offset) => fetchPageWithRetry(url, buildPageParams({ offset }), onProgress),
      API_LIMIT
    );
  }

  const allRecords: RawRecord[] = [];
  const currentYear = new Date().getFullYear();
  for (const year of fullScanYears(2000, currentYear)) {
    const records = await walkPages<RawRecord>(
      (offset) => fetchPageWithRetry(url, buildPageParams({ offset, year }), onProgress),
      API_LIMIT
    );
    allRecords.push(...records);
  }
  return allRecords;
}

async function upsertPermit(
  db: SQLite.SQLiteDatabase,
  permit: ReturnType<typeof normalizeRecord>
): Promise<UpsertOutcome> {
  const existing = await db.getFirstAsync<{ id: number; status: string }>(
    'SELECT id, status FROM permits WHERE source_id = ?',
    permit.source_id
  );

  const now = new Date().toISOString();

  if (!existing) {
    // `INSERT OR IGNORE`: if a concurrent sync inserted the same source_id
    // between the lookup and here, the insert is ignored (changes === 0) and
    // the permit is not new to us. classifyUpsert reads `changes` so the
    // "new permits" count (and its notification) is not inflated.
    const { changes } = await db.runAsync(
      `INSERT OR IGNORE INTO permits (dataset, source_id, filing_type, source_updated_at,
        first_seen_at, address, zone, codvia, procedimento, date_issued,
        status, status_raw, tags, source_link, is_new)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      permit.dataset,
      permit.source_id,
      permit.filing_type,
      permit.source_updated_at,
      now,
      permit.address,
      permit.zone,
      permit.codvia,
      permit.procedimento,
      permit.date_issued,
      permit.status,
      permit.status_raw,
      permit.tags,
      permit.source_link
    );
    return classifyUpsert(null, permit.status, changes);
  }

  const outcome = classifyUpsert(existing, permit.status, 0);
  if (outcome === 'updated') {
    await db.runAsync(
      `UPDATE permits SET status=?, status_raw=?, date_issued=?, tags=?, is_new=1 WHERE id=?`,
      permit.status,
      permit.status_raw,
      permit.date_issued,
      permit.tags,
      existing.id
    );
  }

  return outcome;
}

export interface SyncResult {
  dataset: string;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

/**
 * Sync every dataset through one fetch strategy. `syncRecent` and `syncFull`
 * differ only in how a dataset's raw records are fetched (recent window vs full
 * scan) and the download progress prefix — the per-dataset processing (normalize
 * → upsert → tally → sync_log → build `SyncResult`) and the per-dataset error
 * isolation (one dataset's 404/shape-change is recorded on its own `SyncResult`
 * and never aborts the others) are identical, so they live here once.
 */
async function syncDatasets(
  fetchDataset: (key: DatasetKey, onProgress?: (msg: string) => void) => Promise<RawRecord[]>,
  downloadLabel: (label: string) => string,
  onProgress?: (msg: string) => void
): Promise<SyncResult[]> {
  const db = await getDb();
  const results: SyncResult[] = [];

  for (const key of Object.keys(DATASETS) as DatasetKey[]) {
    try {
      onProgress?.(downloadLabel(DATASETS[key].label));
      const records = await fetchDataset(key, onProgress);
      onProgress?.(`Elaborazione ${records.length} pratiche ${key.toUpperCase()}...`);

      const outcomes: UpsertOutcome[] = [];
      for (const raw of records) {
        outcomes.push(await upsertPermit(db, normalizeRecord(key, raw)));
      }
      const { inserted, updated } = tallyOutcomes(outcomes);

      await db.runAsync(
        'INSERT INTO sync_log (dataset, synced_at, new_count, updated_count) VALUES (?, ?, ?, ?)',
        key,
        new Date().toISOString(),
        inserted,
        updated
      );

      results.push({ dataset: key, fetched: records.length, inserted, updated });
      onProgress?.(
        `${key.toUpperCase()}: ${records.length} scaricati, ${inserted} nuovi, ${updated} aggiornati`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ dataset: key, fetched: 0, inserted: 0, updated: 0, error: message });
      onProgress?.(`${key.toUpperCase()}: errore — ${message}`);
    }
  }
  return results;
}

export function syncRecent(onProgress?: (msg: string) => void): Promise<SyncResult[]> {
  return syncDatasets(
    (key, op) => fetchDatasetRecent(key, 2, op),
    (label) => `Scaricamento ${label}...`,
    onProgress
  );
}

export function syncFull(onProgress?: (msg: string) => void): Promise<SyncResult[]> {
  return syncDatasets(fetchDatasetFull, (label) => `Scaricamento completo ${label}...`, onProgress);
}

export async function getLastSyncTime(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ synced_at: string }>(
    'SELECT synced_at FROM sync_log ORDER BY synced_at DESC LIMIT 1'
  );
  return row?.synced_at ?? null;
}
