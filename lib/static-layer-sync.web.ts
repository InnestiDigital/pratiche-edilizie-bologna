/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * `static-layer-sync.ts` fetches a static layer's markers off the network. For the
 * web export we do no network work: return the deterministic
 * {@link STATIC_MARKER_FIXTURES} for the requested layer so the map screenshot can
 * show the farmacie overlay from fixture data (no SQLite, no simulator). Native +
 * vitest use `static-layer-sync.ts`. The export surface mirrors the native module
 * (tsc guards drift), so `app/(tabs)/map.tsx` calls the same `fetchStaticLayer` on
 * both platforms.
 */
import type { fetchPage } from './fetch-page';
import { STATIC_MARKER_FIXTURES } from './screenshot-fixtures';
import type { StaticLayerId, StaticMarker } from './static-layers';

export interface FetchStaticLayerOptions {
  fetchPage?: typeof fetchPage;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}

export function fetchStaticLayer(
  layer: StaticLayerId,
  _opts: FetchStaticLayerOptions = {}
): Promise<StaticMarker[]> {
  return Promise.resolve(STATIC_MARKER_FIXTURES.filter((m) => m.layer === layer));
}
