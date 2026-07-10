/**
 * Reconcile a freshly-normalized permit against the stored row before change
 * detection, carrying forward an app-derived geocode the normalizer cannot
 * reproduce.
 *
 * The problem this solves is a cross-module interaction bug. Edilizia rows carry
 * NO source coordinate: the normalizer writes `extra = {"civico":"12"}`, and the
 * P4 gazetteer back-fill (`civici-backfill.ts`) later MERGES `lat`/`lon` into that
 * stored `extra` so the row becomes `{"civico":"12","lat":"44.49","lon":"11.34"}`.
 *
 * On the next sync the same row re-normalizes back to `{"civico":"12"}` — the
 * normalizer has no way to know the row was geocoded. `classifyUpsert` compares
 * `extra` by string equality, so the incoming (2-key) vs stored (4-key) strings
 * differ → the row is misclassified `updated`, and `sync.ts`'s update rewrites
 * `extra` down to `{"civico":"12"}`, DESTROYING the coordinate and re-flagging
 * `is_new=1` (a spurious "aggiornate" notification). Worse, the manual sync screen
 * re-runs the back-fill afterward so it self-heals, but the background task
 * (`background-sync.ts`) does NOT back-fill — so every hourly background sync
 * permanently wipes edilizia pins and fires a phantom alert.
 *
 * The fix: before classifying/rewriting, merge the stored geocode back into the
 * incoming permit's `extra`, so an otherwise-unchanged edilizia row round-trips
 * byte-identically (→ `unchanged`, no wipe, no phantom notification), and a
 * genuinely-changed one keeps its pin instead of losing it.
 *
 * Correctness guard — a coordinate is a pure function of the `codvia`+`civico`
 * join keys, so it is only carried forward when BOTH are unchanged. If either key
 * changed, the stored pin is stale (it points at the OLD address); it is dropped
 * so the next back-fill re-geocodes from the new keys rather than pinning the row
 * at a coordinate that no longer matches its street/house number.
 */

import type { PermitContent } from './upsert-classify';
import { getCoords, getCivico, decodeExtra } from './permit-extra';
import { compactExtra } from './source-shared';

/**
 * Return `incoming` with the stored row's geocoded `lat`/`lon` merged into its
 * `extra`, when the incoming permit lost a coordinate the stored row carries and
 * the geocode join keys are unchanged. Otherwise `incoming` is returned unchanged.
 *
 * Pure — no SQLite, no clock. Scoped to edilizia in practice without a category
 * check: every other source stamps a coordinate into `extra` at normalize time,
 * so `incoming` already carries one and the first guard returns immediately.
 */
export function reconcileGeocodedExtra<T extends PermitContent>(
  existing: PermitContent,
  incoming: T
): T {
  // The incoming record already has a usable coordinate (a source-geocoded
  // category, or a future edilizia coordinate source) — nothing to carry.
  if (getCoords(incoming.extra) !== null) return incoming;
  // The stored row has no usable coordinate — nothing to carry (and never carry a
  // corrupt / out-of-range stored pin: getCoords rejects those).
  if (getCoords(existing.extra) === null) return incoming;
  // The pin is a pure function of (codvia, civico). A changed key makes it stale;
  // drop it so the next back-fill re-geocodes rather than carrying a wrong pin.
  if (existing.codvia !== incoming.codvia) return incoming;
  if (getCivico(existing.extra) !== getCivico(incoming.extra)) return incoming;

  // Carry the EXACT stored coordinate strings (not re-stringified numbers) so the
  // merged `extra` round-trips byte-identically to what the back-fill wrote —
  // keeping `classifyUpsert`'s string-equality comparison stable.
  const stored = decodeExtra(existing.extra);
  return {
    ...incoming,
    extra: compactExtra({ ...decodeExtra(incoming.extra), lat: stored.lat, lon: stored.lon }),
  };
}
