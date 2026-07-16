import { BOLOGNA_API_BASE, API_LIMIT } from './constants';
import { fetchPage } from './fetch-page';
import { withRetry } from './retry';
import { walkPages } from './paginate';
import { buildPageParams } from './ods-request';
import type { ParsedPage } from './schemas';
import {
  STATIC_LAYERS,
  type StaticLayerConfig,
  type StaticLayerId,
  type StaticMarker,
} from './static-layers';
import { parseFarmaciePage } from './source-farmacie';
import { parseScuolePage } from './source-scuole';
import { parseMercatoPage } from './source-mercati';

/**
 * DEVICE-NETWORK glue for the static context layers (docs/ROADMAP.md §4b). The
 * thin, headless-unverifiable seam that fetches one static layer's markers off the
 * Bologna ODS endpoint on demand (the map screen calls it when a layer is toggled
 * ON). Mirrors `civici-sync.ts`: every DECISION is in a vitest-gated pure core
 * (the per-layer ingress parser in `source-*.ts`), and the only new logic here is
 * the URL build + the paginated walk + the injectable transport.
 *
 * Static layers are downloaded once per session and held in the map screen's state
 * — they are inert reference data (no dates), so there is nothing to re-sync and
 * nothing to persist to SQLite (a next slice may cache them on-device; a
 * session-only fetch is fine for v1). This module NEVER writes the DB, the feed, or
 * a notification.
 */

/**
 * The per-layer ingress parser. Exhaustive `Record<StaticLayerId, …>` so adding a
 * layer id fails the build until it is paired with a page parser — the static-layer
 * analogue of `source-runtime.ts`, kept here (device glue) so the pure
 * `static-layers.ts` registry stays free of schema/parser imports.
 */
export const STATIC_LAYER_PARSERS: Record<
  StaticLayerId,
  (payload: unknown) => ParsedPage<StaticMarker>
> = {
  farmacie: parseFarmaciePage,
  scuole: parseScuolePage,
  mercati: parseMercatoPage,
};

/** Options for {@link fetchStaticLayer}. `fetchPage` is injectable for tests. */
export interface FetchStaticLayerOptions {
  /** Transport override — defaults to the real {@link fetchPage}. */
  fetchPage?: typeof fetchPage;
  /** Caller cancellation, forwarded to each page request. */
  signal?: AbortSignal;
  /** Optional progress sink (retry notices). */
  onProgress?: (msg: string) => void;
}

/**
 * Fetch every marker for one static layer, paging the layer's ODS dataset under the
 * offset cap ({@link walkPages}) and validating each page through its ingress
 * parser. Farmacie is a single 125-row page, but the walk is used anyway so a later
 * over-a-page layer needs no new plumbing.
 *
 * Best-effort by contract, but with ONE error channel: a transient transport blip
 * is retried with backoff ({@link withRetry}); a permanent failure (404/410,
 * shape drift → `SyncIngressError`, a caller abort) REJECTS with the typed error
 * rather than being swallowed — the map screen catches it and simply leaves the
 * layer un-toggled, so a failed fetch never crashes the map.
 *
 * @throws {import('./fetch-page').SyncFetchError} on a permanent transport failure.
 * @throws {import('./schemas').SyncIngressError} on an endpoint shape drift.
 */
export function fetchStaticLayer(
  layer: StaticLayerId,
  opts: FetchStaticLayerOptions = {}
): Promise<StaticMarker[]> {
  const { fetchPage: fetchPageImpl = fetchPage, signal, onProgress } = opts;
  // Widen the narrow per-entry literal to the interface so the optional
  // `selectFields` (present only on layers without a natural id) is visible.
  const config: StaticLayerConfig = STATIC_LAYERS[layer];
  const url = BOLOGNA_API_BASE.replace('{slug}', config.slug);
  const parse = STATIC_LAYER_PARSERS[layer];
  // Layers whose dataset carries no natural per-row id (mercati) select the ODS
  // meta `recordid` + the fields their parser reads; the others fetch the full
  // payload (no `select` → identical query to before).
  const select = config.selectFields ? config.selectFields.join(',') : undefined;

  return walkPages<StaticMarker>(
    (offset) =>
      withRetry(
        () =>
          fetchPageImpl<StaticMarker>(url, buildPageParams({ offset, select }), { parse, signal }),
        {
          onRetry: ({ attempt, delayMs }) =>
            onProgress?.(`Ritento ${config.label} (${attempt}) tra ${Math.round(delayMs)}ms…`),
        }
      ),
    API_LIMIT
  );
}
