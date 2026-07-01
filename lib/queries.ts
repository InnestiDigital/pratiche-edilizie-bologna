import type * as SQLite from 'expo-sqlite';
import type { FilingType, Quartiere } from './constants';

export interface Permit {
  id: number;
  dataset: string;
  source_id: string;
  filing_type: FilingType;
  source_updated_at: string | null;
  first_seen_at: string;
  address: string | null;
  zone: string | null;
  codvia: number | null;
  procedimento: string | null;
  date_issued: string | null;
  status: string;
  status_raw: string;
  tags: string;
  source_link: string | null;
  is_new: number;
}

export type SortOption =
  | 'newest'
  | 'oldest'
  | 'request_newest'
  | 'request_oldest'
  | 'closing_newest';

export const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Rilevamento (recenti)',
  oldest: 'Rilevamento (meno recenti)',
  request_newest: 'Data richiesta (recenti)',
  request_oldest: 'Data richiesta (meno recenti)',
  closing_newest: 'Data chiusura (recenti)',
};

const SORT_SQL: Record<SortOption, string> = {
  newest: 'first_seen_at DESC',
  oldest: 'first_seen_at ASC',
  request_newest: 'source_updated_at DESC',
  request_oldest: 'source_updated_at ASC',
  closing_newest: 'date_issued DESC',
};

export interface FeedFilters {
  zones: Quartiere[];
  filingTypes: FilingType[];
  tags: string[];
  searchQuery?: string;
  statuses?: string[];
  onlyNew?: boolean;
  sort?: SortOption;
}

/**
 * Safely decode a permit's `tags` column into a string array.
 *
 * `normalize.ts` always writes this as `JSON.stringify(string[])`, but a legacy
 * row, a manual DB edit, or a future schema change could leave a malformed value.
 * A raw `JSON.parse` inside the feed's tag post-filter would throw and blank the
 * whole feed, so parse defensively: any non-array / non-string-element / invalid
 * JSON collapses to `[]` (the row simply matches no tag filter) instead of crashing.
 */
export function parsePermitTags(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((t): t is string => typeof t === 'string');
}

/**
 * Escape a user search term for safe use inside a SQL `LIKE` pattern.
 *
 * The feed search wraps the term as `%term%`, so the SQLite `LIKE` wildcards
 * `%` (any run) and `_` (any single char) — plus the escape char `\` itself —
 * would otherwise be interpreted, not matched literally. A search for `100%`
 * or `via_` should match those exact strings, not "100 followed by anything".
 * Callers must pair the escaped term with an `ESCAPE '\'` clause on the `LIKE`.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function getPermits(
  db: SQLite.SQLiteDatabase,
  filters: FeedFilters,
  limit = 50,
  offset = 0
): Promise<Permit[]> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.zones.length > 0) {
    conditions.push(`zone IN (${filters.zones.map(() => '?').join(',')})`);
    params.push(...filters.zones);
  }

  if (filters.filingTypes.length > 0) {
    conditions.push(`filing_type IN (${filters.filingTypes.map(() => '?').join(',')})`);
    params.push(...filters.filingTypes);
  }

  if (filters.searchQuery) {
    conditions.push("(address LIKE ? ESCAPE '\\' OR procedimento LIKE ? ESCAPE '\\')");
    const q = `%${escapeLike(filters.searchQuery)}%`;
    params.push(q, q);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`status IN (${filters.statuses.map(() => '?').join(',')})`);
    params.push(...filters.statuses);
  }

  if (filters.onlyNew) {
    conditions.push('is_new = 1');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const orderBy = SORT_SQL[filters.sort ?? 'newest'];

  params.push(limit, offset);

  const rows = await db.getAllAsync<Permit>(
    `SELECT * FROM permits ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params
  );

  // Post-filter by tags (JSON array in SQLite). Parse defensively so a corrupt
  // tags column can't throw and blank the feed — see parsePermitTags.
  if (filters.tags.length > 0) {
    return rows.filter((row) => {
      const permitTags = parsePermitTags(row.tags);
      return filters.tags.some((t) => permitTags.includes(t));
    });
  }

  return rows;
}

export async function getPermitById(db: SQLite.SQLiteDatabase, id: number): Promise<Permit | null> {
  return db.getFirstAsync<Permit>('SELECT * FROM permits WHERE id = ?', id);
}

export async function getStats(db: SQLite.SQLiteDatabase): Promise<{
  total: number;
  byDataset: Record<string, number>;
  byZone: Record<string, number>;
  newCount: number;
}> {
  const total =
    (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM permits'))?.c ?? 0;
  const newCount =
    (await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM permits WHERE is_new = 1'))
      ?.c ?? 0;

  const dsRows = await db.getAllAsync<{ dataset: string; c: number }>(
    'SELECT dataset, COUNT(*) as c FROM permits GROUP BY dataset'
  );
  const byDataset: Record<string, number> = {};
  for (const r of dsRows) byDataset[r.dataset] = r.c;

  const zoneRows = await db.getAllAsync<{ zone: string; c: number }>(
    'SELECT zone, COUNT(*) as c FROM permits WHERE zone IS NOT NULL GROUP BY zone ORDER BY c DESC'
  );
  const byZone: Record<string, number> = {};
  for (const r of zoneRows) byZone[r.zone] = r.c;

  return { total, byDataset, byZone, newCount };
}

export async function markAllSeen(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE permits SET is_new = 0 WHERE is_new = 1');
}
