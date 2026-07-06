import * as SQLite from 'expo-sqlite';
import { API_LIMIT } from './constants';
import type { NormalizedPermit } from './normalize';
import { fetchPage } from './fetch-page';
import { withRetry } from './retry';
import type { ParsedPage } from './schemas';
import { getDb } from './db';
import {
  classifyUpsert,
  PERMIT_CONTENT_FIELDS,
  type PermitContent,
  type UpsertOutcome,
} from './upsert-classify';
import { tallyOutcomes } from './sync-tally';
import {
  walkPages,
  recentYears,
  fullScanYears,
  bisectRange,
  addYearsIso,
  MAX_OFFSET,
  type DateRange,
} from './paginate';
import { buildOdsUrl, buildPageParams, buildDateRangeWhere, buildSinceWhere } from './ods-request';
import { SOURCES, type Category, type SourceConfig, type SourceKey } from './sources';
import { SOURCE_RUNTIME } from './source-runtime';
import { assertNever } from './assert-never';
import { recordNoun } from './record-noun';

/** The default first year swept by a `year-refine` / `date-range` full scan. */
const DEFAULT_FULL_SCAN_FROM_YEAR = 2000;

type SyncMode = 'recent' | 'full';

/**
 * Fetch one page (validated + normalized by the source's own parser), retrying
 * transient transport failures with backoff. A blip on a single page of a
 * multi-page walk must not abort the whole source sync; a permanent failure
 * (404/410, 4xx, bad shape) still fails fast. Retries are surfaced through
 * `onProgress` so a long sync doesn't look frozen.
 */
function fetchPageWithRetry(
  url: string,
  params: Record<string, string>,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  onProgress?: (msg: string) => void
): Promise<ParsedPage<NormalizedPermit>> {
  return withRetry(() => fetchPage(url, params, { parse }), {
    onRetry: ({ attempt, delayMs, error }) =>
      onProgress?.(
        `Ritento (${attempt}) tra ${Math.round(delayMs)}ms — ` +
          `${error instanceof Error ? error.message : String(error)}`
      ),
  });
}

/** Walk every page of a single query window (one refine/where or none). */
function walkWindow(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  params: (offset: number) => Record<string, string>,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  return walkPages<NormalizedPermit>(
    (offset) => fetchPageWithRetry(url, params(offset), parse, onProgress),
    API_LIMIT
  );
}

/** Read a query window's `total_count` via a single-record probe (with its where). */
async function probeCount(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  where: string | undefined,
  onProgress?: (msg: string) => void
): Promise<number> {
  // `buildPageParams` omits the `where` key when it is undefined, so the no-where
  // probe is the identical `{ limit: '1', offset: '0' }` a dedicated probe builder
  // produced — one builder, one code path.
  const params = buildPageParams({ offset: 0, limit: 1, where });
  const { totalCount } = await fetchPageWithRetry(url, params, parse, onProgress);
  return totalCount;
}

/**
 * `year-refine` sweep (edilizia). RECENT walks the last 2 filing years via the
 * ODS refine facet; FULL count-probes the whole dataset and either walks it
 * plainly (under the cap) or per year (over the cap) — byte-identical to the
 * pre-refactor `fetchDatasetRecent`/`fetchDatasetFull`.
 */
async function sweepYearRefine(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  mode: SyncMode,
  currentYear: number,
  fromYear: number,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  if (mode === 'recent') {
    const all: NormalizedPermit[] = [];
    for (const year of recentYears(currentYear, 2)) {
      all.push(
        ...(await walkWindow(url, parse, (offset) => buildPageParams({ offset, year }), onProgress))
      );
    }
    return all;
  }

  const totalCount = await probeCount(url, parse, undefined, onProgress);
  if (totalCount <= MAX_OFFSET) {
    return walkWindow(url, parse, (offset) => buildPageParams({ offset }), onProgress);
  }

  const all: NormalizedPermit[] = [];
  for (const year of fullScanYears(fromYear, currentYear)) {
    all.push(
      ...(await walkWindow(url, parse, (offset) => buildPageParams({ offset, year }), onProgress))
    );
  }
  return all;
}

/**
 * Walk one half-open date window, recursively bisecting any sub-window whose
 * probed count exceeds {@link MAX_OFFSET} so no row beyond the ODS offset cap is
 * silently lost. A window under the cap costs exactly one probe + one walk
 * (byte-identical to the old per-year path). A single day that itself exceeds the
 * cap (physically implausible for these datasets) cannot bisect further and is
 * walked as-is, accepting the cap truncation.
 */
async function walkRangeUnderCap(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  field: string,
  range: DateRange,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  const where = buildDateRangeWhere(field, range.from, range.toExclusive);
  const count = await probeCount(url, parse, where, onProgress);
  const halves = count > MAX_OFFSET ? bisectRange(range) : null;
  if (halves === null) {
    return walkWindow(url, parse, (offset) => buildPageParams({ offset, where }), onProgress);
  }
  return [
    ...(await walkRangeUnderCap(url, parse, field, halves[0], onProgress)),
    ...(await walkRangeUnderCap(url, parse, field, halves[1], onProgress)),
  ];
}

/**
 * `date-range` sweep (commercio, segnalazioni). Walks one calendar year at a
 * time via a half-open ODS-QL `where` (these datasets expose no exact-year
 * facet). A year that itself exceeds the offset cap is recursively bisected by
 * {@link walkRangeUnderCap} — narrowing as far as needed (not a fixed 12-month
 * split, which lost rows for any month over the cap). RECENT covers the last 2
 * years; FULL covers `fromYear`→now.
 */
async function sweepDateRange(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  field: string,
  mode: SyncMode,
  currentYear: number,
  fromYear: number,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  const years =
    mode === 'recent' ? recentYears(currentYear, 2) : fullScanYears(fromYear, currentYear);
  const all: NormalizedPermit[] = [];

  for (const year of years) {
    all.push(
      ...(await walkRangeUnderCap(
        url,
        parse,
        field,
        { from: `${year}-01-01`, toExclusive: `${year + 1}-01-01` },
        onProgress
      ))
    );
  }
  return all;
}

/**
 * Walk an open-ended ("since") window under the offset cap. Probes the window
 * count first: under the cap → one plain walk. Over the cap on an unbounded
 * window → peel one bounded year off the front (bisected further by
 * {@link walkRangeUnderCap} if even that year is over the cap), then recurse on
 * the remainder. Terminates: the dataset is finite, so the open tail's count
 * reaches the cap after finitely many one-year peels.
 */
async function walkSinceUnderCap(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  field: string,
  since: string,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  const where = buildSinceWhere(field, since);
  const count = await probeCount(url, parse, where, onProgress);
  if (count <= MAX_OFFSET) {
    return walkWindow(url, parse, (offset) => buildPageParams({ offset, where }), onProgress);
  }
  const boundary = addYearsIso(since, 1);
  return [
    ...(await walkRangeUnderCap(
      url,
      parse,
      field,
      { from: since, toExclusive: boundary },
      onProgress
    )),
    ...(await walkSinceUnderCap(url, parse, field, boundary, onProgress)),
  ];
}

/**
 * `future-window` sweep (eventi). A forward-looking walk keeping records from
 * `today − lookBackDays` onward — the same query for RECENT and FULL (most
 * historical events are never fetched). The clock read lives here; the pure
 * `buildSinceWhere` turns the plain date into the ODS-QL clause. Costs one extra
 * count-probe vs. a blind walk (accepted for cap safety) but never silently
 * truncates a window that grows past the offset cap.
 */
function sweepFutureWindow(
  url: string,
  parse: (json: unknown) => ParsedPage<NormalizedPermit>,
  field: string,
  lookBackDays: number,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - lookBackDays);
  return walkSinceUnderCap(url, parse, field, since.toISOString().slice(0, 10), onProgress);
}

/**
 * Fetch + normalize every record for one source, dispatching on its declared
 * sweep strategy. The `switch` is exhaustive over the `SweepStrategy` discriminated
 * union (`assertNever` in `default` fails the build if a variant is added without
 * a branch). Returns fully-normalized permits — the raw row type never escapes the
 * `source-runtime.ts` boundary.
 */
function fetchSource(
  key: SourceKey,
  mode: SyncMode,
  onProgress?: (msg: string) => void
): Promise<NormalizedPermit[]> {
  // Widen from the `as const` literal to `SourceConfig` so the optional
  // `fullScanFromYear` is accessible uniformly across every entry.
  const { sweep, fullScanFromYear }: SourceConfig = SOURCES[key];
  const url = buildOdsUrl(key);
  const parse = SOURCE_RUNTIME[key].parseAndNormalize;
  const currentYear = new Date().getFullYear();
  const fromYear = fullScanFromYear ?? DEFAULT_FULL_SCAN_FROM_YEAR;

  switch (sweep.kind) {
    case 'full':
      return walkWindow(url, parse, (offset) => buildPageParams({ offset }), onProgress);
    case 'year-refine':
      return sweepYearRefine(url, parse, mode, currentYear, fromYear, onProgress);
    case 'date-range':
      return sweepDateRange(url, parse, sweep.field, mode, currentYear, fromYear, onProgress);
    case 'future-window':
      return sweepFutureWindow(url, parse, sweep.field, sweep.lookBackDays, onProgress);
    default:
      return assertNever(sweep);
  }
}

async function upsertPermit(
  db: SQLite.SQLiteDatabase,
  permit: NormalizedPermit
): Promise<UpsertOutcome> {
  // Select every content column classifyUpsert compares (single source of truth:
  // PERMIT_CONTENT_FIELDS), so a change to any of them — not just status — is
  // detected and healed. SQLite returns `codvia` as number|null, matching
  // NormalizedPermit, so the row is structurally a PermitContent (no `as`).
  const existing = await db.getFirstAsync<{ id: number } & PermitContent>(
    `SELECT id, ${PERMIT_CONTENT_FIELDS.join(', ')} FROM permits WHERE source_id = ?`,
    permit.source_id
  );

  const now = new Date().toISOString();

  if (!existing) {
    // `INSERT OR IGNORE`: if a concurrent sync inserted the same source_id
    // between the lookup and here, the insert is ignored (changes === 0) and
    // the permit is not new to us. classifyUpsert reads `changes` so the
    // "new permits" count (and its notification) is not inflated.
    const { changes } = await db.runAsync(
      `INSERT OR IGNORE INTO permits (dataset, source_id, filing_type, category, source_updated_at,
        first_seen_at, address, zone, codvia, procedimento, date_issued,
        status, status_raw, tags, source_link, title, extra, is_new)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      permit.dataset,
      permit.source_id,
      permit.filing_type,
      permit.category,
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
      permit.source_link,
      permit.title,
      permit.extra
    );
    return classifyUpsert(null, permit, changes);
  }

  const outcome = classifyUpsert(existing, permit, 0);
  if (outcome === 'updated') {
    // Rewrite every content column (derived from the same PERMIT_CONTENT_FIELDS
    // that drove the comparison) so any corrected field — not only status —
    // heals. `is_new=1` re-flags the row as freshly touched.
    await db.runAsync(
      `UPDATE permits SET ${PERMIT_CONTENT_FIELDS.map((f) => `${f}=?`).join(', ')}, is_new=1 WHERE id=?`,
      ...PERMIT_CONTENT_FIELDS.map((f) => permit[f]),
      existing.id
    );
  }

  return outcome;
}

export interface SyncResult {
  /** The source key (registry key), stored verbatim in `sync_log.dataset`. */
  dataset: string;
  /** The civic category of this source — stamped from `SOURCES[key].category`. */
  category: Category;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

/**
 * Sync every enabled source through one fetch mode. `syncRecent` and `syncFull`
 * differ only in the per-source fetch window (recent vs full scan) and the
 * download progress prefix — the per-source processing (normalize happens inside
 * `fetchSource`, then upsert → tally → sync_log → build `SyncResult`) and the
 * per-source error isolation (one source's 404/shape-change is recorded on its
 * own `SyncResult` and never aborts the others) are identical, so they live here
 * once.
 *
 * `categories`, when given, restricts the run to sources whose category is in the
 * list (a user who opted out of a category must not pay for its download). When
 * `undefined`, every source syncs. An edilizia-only `categories` produces a run
 * byte-identical to the pre-refactor 3-dataset sync (same order, requests, upserts,
 * sync_log rows and SyncResults).
 */
async function syncSources(
  mode: SyncMode,
  downloadLabel: (label: string) => string,
  onProgress?: (msg: string) => void,
  categories?: Category[]
): Promise<SyncResult[]> {
  const db = await getDb();
  const results: SyncResult[] = [];

  for (const key of Object.keys(SOURCES) as SourceKey[]) {
    const { category, label } = SOURCES[key];
    if (categories !== undefined && !categories.includes(category)) continue;

    try {
      onProgress?.(downloadLabel(label));
      const permits = await fetchSource(key, mode, onProgress);
      onProgress?.(
        `Elaborazione ${permits.length} ${recordNoun(permits.length)} ${key.toUpperCase()}...`
      );

      const outcomes: UpsertOutcome[] = [];
      for (const permit of permits) {
        outcomes.push(await upsertPermit(db, permit));
      }
      const { inserted, updated } = tallyOutcomes(outcomes);

      await db.runAsync(
        'INSERT INTO sync_log (dataset, synced_at, new_count, updated_count) VALUES (?, ?, ?, ?)',
        key,
        new Date().toISOString(),
        inserted,
        updated
      );

      results.push({ dataset: key, category, fetched: permits.length, inserted, updated });
      onProgress?.(
        `${key.toUpperCase()}: ${permits.length} scaricati, ${inserted} nuovi, ${updated} aggiornati`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ dataset: key, category, fetched: 0, inserted: 0, updated: 0, error: message });
      onProgress?.(`${key.toUpperCase()}: errore — ${message}`);
    }
  }
  return results;
}

export function syncRecent(
  onProgress?: (msg: string) => void,
  categories?: Category[]
): Promise<SyncResult[]> {
  return syncSources('recent', (label) => `Scaricamento ${label}...`, onProgress, categories);
}

export function syncFull(
  onProgress?: (msg: string) => void,
  categories?: Category[]
): Promise<SyncResult[]> {
  return syncSources(
    'full',
    (label) => `Scaricamento completo ${label}...`,
    onProgress,
    categories
  );
}

export async function getLastSyncTime(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ synced_at: string }>(
    'SELECT synced_at FROM sync_log ORDER BY synced_at DESC LIMIT 1'
  );
  return row?.synced_at ?? null;
}
