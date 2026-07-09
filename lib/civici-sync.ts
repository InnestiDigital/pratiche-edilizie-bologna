import type * as SQLite from 'expo-sqlite';
import { BOLOGNA_API_BASE, API_LIMIT } from './constants';
import { fetchPage } from './fetch-page';
import { withRetry } from './retry';
import { walkPages } from './paginate';
import { buildPageParams } from './ods-request';
import { parseCiviciPage } from './source-civici';
import { buildCiviciIndex, type CiviciRecord } from './geocode-civici';
import { distinctCodvia, planCiviciFetch } from './civici-fetch-plan';
import { planCiviciBackfill, type EdiliziaBackfillRow } from './civici-backfill';

/**
 * DEVICE GLUE for the P4 "widen Nei dintorni to edilizia" slice
 * (docs/P4-map-radius.md §3, director mandate #1). This is the thin,
 * headless-unverifiable seam that composes the four already-tested pure cores end
 * to end so coordinate-less EDILIZIA rows gain a `extra.lat/lon` and their detail
 * screen's shipped "Nei dintorni" proximity card (`nearby-permits.ts`) — today
 * rendered only on the four geo-dotted categories — automatically widens to
 * edilizia:
 *
 *   distinct `codvia` of stored edilizia rows  ({@link distinctCodvia})
 *     → cap-safe scoped `where=codvia in (…)` batches  ({@link planCiviciFetch})
 *     → page each batch of the `rifter_civici_pt` gazetteer over the transport
 *       ({@link fetchPage} + {@link parseCiviciPage} ingress)
 *     → build the lookup  ({@link buildCiviciIndex})
 *     → decide the coordinate back-fill  ({@link planCiviciBackfill})
 *     → write the merged `extra` back to SQLite.
 *
 * Every DECISION is in a vitest-gated pure core; the ONLY new logic here is the
 * orchestration loop + the two effects (a SQLite read of the edilizia rows and a
 * transactional write of the updates) + the default network fetcher. Those two
 * effects are INJECTED — the SQLite handle and the batch fetcher are parameters —
 * so the glue itself (the loop, the index build, the apply) is unit-tested with a
 * fake db + a fake fetcher (`civici-sync.test.ts`), and only the tiny default
 * fetcher body remains verify-on-device.
 *
 * No external geocoding service is used (the no-backend/no-tracking invariant):
 * coordinates come only from the downloaded Bologna gazetteer.
 */

/** The ODS dataset slug of the Bologna "Numeri civici" gazetteer. */
export const CIVICI_SLUG = 'rifter_civici_pt';

/**
 * Fetch every gazetteer record for one scoped `where` clause (a batch of street
 * codes), walking its pages under the ODS offset cap. Injected into
 * {@link backfillEdiliziaCoords} so the orchestration is testable without a
 * network; {@link defaultCiviciBatchFetcher} is the real implementation.
 */
export type CiviciBatchFetcher = (
  where: string,
  onProgress?: (msg: string) => void
) => Promise<CiviciRecord[]>;

/** Per-run disposition of a coordinate back-fill pass over the edilizia rows. */
export interface CiviciBackfillSummary {
  /** Coordinate-less edilizia rows considered this pass. */
  candidates: number;
  /** Gazetteer records fetched (across every batch). */
  fetched: number;
  /** Rows freshly geocoded + written this pass. */
  geocoded: number;
  /** Rows skipped because they already carried a usable coordinate. */
  alreadyCoded: number;
  /** Rows whose `codvia`(+`civico`) did not resolve against the gazetteer. */
  unresolved: number;
}

const EMPTY_SUMMARY: CiviciBackfillSummary = {
  candidates: 0,
  fetched: 0,
  geocoded: 0,
  alreadyCoded: 0,
  unresolved: 0,
};

/**
 * The real {@link CiviciBatchFetcher}: pages the gazetteer records endpoint for
 * one scoped `where`, retrying transient transport failures with backoff (a blip
 * on one page must not abort the whole back-fill; a permanent failure still fails
 * fast). Validates each page through the `rifter_civici_pt` ingress parser.
 */
export function defaultCiviciBatchFetcher(
  where: string,
  onProgress?: (msg: string) => void
): Promise<CiviciRecord[]> {
  const url = BOLOGNA_API_BASE.replace('{slug}', CIVICI_SLUG);
  return walkPages<CiviciRecord>(
    (offset) =>
      withRetry(
        () => fetchPage(url, buildPageParams({ offset, where }), { parse: parseCiviciPage }),
        {
          onRetry: ({ attempt, delayMs, error }) =>
            onProgress?.(
              `Ritento civici (${attempt}) tra ${Math.round(delayMs)}ms — ` +
                `${error instanceof Error ? error.message : String(error)}`
            ),
        }
      ),
    API_LIMIT
  );
}

/**
 * Geocode the coordinate-less edilizia rows in the local DB against the Bologna
 * civici gazetteer, writing each resolved `lat`/`lon` back into the row's `extra`.
 * Idempotent: a row that already carries a coordinate is excluded at the SQL level
 * (the `extra NOT LIKE '%"lat"%'` probe mirrors `getNearbyPermits`), so a fully
 * geocoded DB does ZERO network work — a re-run after a later sync only touches the
 * rows that arrived without a coordinate.
 *
 * The gazetteer fetch is SCOPED to only the streets that actually appear in local
 * edilizia rows (never a full ~77 600-row walk that would overrun the offset cap),
 * so the cost scales with how many distinct streets the user has synced.
 *
 * @param db the open SQLite handle (injected → the glue is native-free for tests).
 * @param fetchBatch how one scoped batch is fetched (defaults to the real network
 *   walker; a fake is injected in tests).
 * @param onProgress optional progress sink surfaced on the sync screen.
 */
export async function backfillEdiliziaCoords(
  db: SQLite.SQLiteDatabase,
  fetchBatch: CiviciBatchFetcher = defaultCiviciBatchFetcher,
  onProgress?: (msg: string) => void
): Promise<CiviciBackfillSummary> {
  // Only rows still lacking a coordinate. The LIKE mirrors getNearbyPermits' coord
  // probe: a row whose `extra` already holds a `"lat"` key is skipped here, so the
  // pass is a no-op (no fetch, no write) once every edilizia row is geocoded.
  const rows = await db.getAllAsync<EdiliziaBackfillRow>(
    `SELECT source_id, codvia, extra FROM permits
     WHERE category = 'edilizia' AND codvia IS NOT NULL AND extra NOT LIKE '%"lat"%'`
  );
  if (rows.length === 0) return { ...EMPTY_SUMMARY };

  const codvias = distinctCodvia(rows);
  if (codvias.length === 0) {
    // Rows exist but none carries a valid street code → nothing to geocode.
    return { ...EMPTY_SUMMARY, candidates: rows.length, unresolved: rows.length };
  }

  const batches = planCiviciFetch(codvias);
  onProgress?.(`Geocodifica edilizia: ${codvias.length} vie in ${batches.length} lotti…`);

  const records: CiviciRecord[] = [];
  for (const batch of batches) {
    records.push(...(await fetchBatch(batch.where, onProgress)));
  }

  const index = buildCiviciIndex(records);
  const plan = planCiviciBackfill(rows, index);

  if (plan.updates.length > 0) {
    // One transaction so a partial write can't leave the DB half-geocoded.
    await db.withTransactionAsync(async () => {
      for (const update of plan.updates) {
        await db.runAsync(
          'UPDATE permits SET extra = ? WHERE source_id = ?',
          update.extra,
          update.source_id
        );
      }
    });
  }

  onProgress?.(`Geocodifica edilizia: ${plan.geocoded} posizioni su ${rows.length} voci`);

  return {
    candidates: rows.length,
    fetched: records.length,
    geocoded: plan.geocoded,
    alreadyCoded: plan.alreadyCoded,
    unresolved: plan.unresolved,
  };
}
