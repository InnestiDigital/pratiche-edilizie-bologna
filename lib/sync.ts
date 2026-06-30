import * as SQLite from 'expo-sqlite';
import { DATASETS, BOLOGNA_API_BASE, API_LIMIT, type DatasetKey } from './constants';
import { normalizeRecord, type RawRecord } from './normalize';
import { parseApiResponse } from './schemas';
import { getDb } from './db';

async function fetchPage(
  url: string,
  params: Record<string, string>
): Promise<{ results: RawRecord[]; totalCount: number }> {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${url}?${qs}`);
  if (!resp.ok) throw new Error(`Errore API: ${resp.status}`);
  const data = await resp.json();
  // Validate the payload shape at the ingress boundary (don't trust field
  // shapes from the external open-data endpoint).
  const { results, totalCount } = parseApiResponse(data);
  return { results, totalCount };
}

async function fetchDatasetRecent(datasetKey: DatasetKey, yearsBack = 2): Promise<RawRecord[]> {
  const slug = DATASETS[datasetKey].slug;
  const url = BOLOGNA_API_BASE.replace('{slug}', slug);
  const currentYear = new Date().getFullYear();
  const allRecords: RawRecord[] = [];

  for (let year = currentYear - yearsBack + 1; year <= currentYear; year++) {
    let offset = 0;
    while (true) {
      const { results } = await fetchPage(url, {
        limit: String(API_LIMIT),
        offset: String(offset),
        refine: `richiesta_anno_prot:${year}`,
      });
      if (results.length === 0) break;
      allRecords.push(...results);
      if (results.length < API_LIMIT) break;
      offset += API_LIMIT;
      if (offset >= 9900) break;
    }
  }
  return allRecords;
}

async function fetchDatasetFull(datasetKey: DatasetKey): Promise<RawRecord[]> {
  const slug = DATASETS[datasetKey].slug;
  const url = BOLOGNA_API_BASE.replace('{slug}', slug);

  const { totalCount } = await fetchPage(url, { limit: '1', offset: '0' });

  if (totalCount <= 9900) {
    const allRecords: RawRecord[] = [];
    let offset = 0;
    while (true) {
      const { results } = await fetchPage(url, {
        limit: String(API_LIMIT),
        offset: String(offset),
      });
      if (results.length === 0) break;
      allRecords.push(...results);
      if (results.length < API_LIMIT) break;
      offset += API_LIMIT;
    }
    return allRecords;
  }

  const allRecords: RawRecord[] = [];
  const currentYear = new Date().getFullYear();
  for (let year = 2000; year <= currentYear; year++) {
    let offset = 0;
    while (true) {
      const { results } = await fetchPage(url, {
        limit: String(API_LIMIT),
        offset: String(offset),
        refine: `richiesta_anno_prot:${year}`,
      });
      if (results.length === 0) break;
      allRecords.push(...results);
      if (results.length < API_LIMIT) break;
      offset += API_LIMIT;
      if (offset >= 9900) break;
    }
  }
  return allRecords;
}

async function upsertPermit(
  db: SQLite.SQLiteDatabase,
  permit: ReturnType<typeof normalizeRecord>
): Promise<'inserted' | 'updated' | 'unchanged'> {
  const existing = await db.getFirstAsync<{ id: number; status: string }>(
    'SELECT id, status FROM permits WHERE source_id = ?',
    permit.source_id
  );

  const now = new Date().toISOString();

  if (!existing) {
    await db.runAsync(
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
    return 'inserted';
  }

  if (existing.status !== permit.status) {
    await db.runAsync(
      `UPDATE permits SET status=?, status_raw=?, date_issued=?, tags=?, is_new=1 WHERE id=?`,
      permit.status,
      permit.status_raw,
      permit.date_issued,
      permit.tags,
      existing.id
    );
    return 'updated';
  }

  return 'unchanged';
}

export interface SyncResult {
  dataset: string;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

export async function syncRecent(onProgress?: (msg: string) => void): Promise<SyncResult[]> {
  const db = await getDb();
  const results: SyncResult[] = [];

  for (const key of Object.keys(DATASETS) as DatasetKey[]) {
    try {
      onProgress?.(`Scaricamento ${DATASETS[key].label}...`);
      const records = await fetchDatasetRecent(key, 2);
      onProgress?.(`Elaborazione ${records.length} pratiche ${key.toUpperCase()}...`);

      let inserted = 0;
      let updated = 0;
      for (const raw of records) {
        const normalized = normalizeRecord(key, raw);
        const result = await upsertPermit(db, normalized);
        if (result === 'inserted') inserted++;
        if (result === 'updated') updated++;
      }

      await db.runAsync(
        'INSERT INTO sync_log (dataset, synced_at, new_count, updated_count) VALUES (?, ?, ?, ?)',
        key,
        new Date().toISOString(),
        inserted,
        updated
      );

      const r: SyncResult = {
        dataset: key,
        fetched: records.length,
        inserted,
        updated,
      };
      results.push(r);
      onProgress?.(
        `${key.toUpperCase()}: ${records.length} scaricati, ${inserted} nuovi, ${updated} aggiornati`
      );
    } catch (e: any) {
      results.push({
        dataset: key,
        fetched: 0,
        inserted: 0,
        updated: 0,
        error: e.message,
      });
      onProgress?.(`${key.toUpperCase()}: errore — ${e.message}`);
    }
  }
  return results;
}

export async function syncFull(onProgress?: (msg: string) => void): Promise<SyncResult[]> {
  const db = await getDb();
  const results: SyncResult[] = [];

  for (const key of Object.keys(DATASETS) as DatasetKey[]) {
    try {
      onProgress?.(`Scaricamento completo ${DATASETS[key].label}...`);
      const records = await fetchDatasetFull(key);
      onProgress?.(`Elaborazione ${records.length} pratiche ${key.toUpperCase()}...`);

      let inserted = 0;
      let updated = 0;
      for (const raw of records) {
        const normalized = normalizeRecord(key, raw);
        const result = await upsertPermit(db, normalized);
        if (result === 'inserted') inserted++;
        if (result === 'updated') updated++;
      }

      await db.runAsync(
        'INSERT INTO sync_log (dataset, synced_at, new_count, updated_count) VALUES (?, ?, ?, ?)',
        key,
        new Date().toISOString(),
        inserted,
        updated
      );

      const r: SyncResult = {
        dataset: key,
        fetched: records.length,
        inserted,
        updated,
      };
      results.push(r);
      onProgress?.(
        `${key.toUpperCase()}: ${records.length} scaricati, ${inserted} nuovi, ${updated} aggiornati`
      );
    } catch (e: any) {
      results.push({
        dataset: key,
        fetched: 0,
        inserted: 0,
        updated: 0,
        error: e.message,
      });
      onProgress?.(`${key.toUpperCase()}: errore — ${e.message}`);
    }
  }
  return results;
}

export async function getLastSyncTime(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ synced_at: string }>(
    'SELECT synced_at FROM sync_log ORDER BY synced_at DESC LIMIT 1'
  );
  return row?.synced_at ?? null;
}
