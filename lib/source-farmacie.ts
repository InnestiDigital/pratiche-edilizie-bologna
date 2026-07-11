import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { geoPointSchema, nullIfEmpty } from './source-shared';
import { STATIC_LAYERS, type StaticMarker } from './static-layers';

/**
 * `farmacie` — the Comune di Bologna pharmacy gazetteer (125 rows, fits in one ODS
 * page: no `MAX_OFFSET` pagination concern). A STATIC LAYER, not a category: these
 * rows never enter the `permits` table, the feed, or the notifications — they are
 * map-only reference points (docs/ROADMAP.md §4b). This module owns the INGRESS
 * parse, mirroring `source-civici.ts`: a zod schema at the network boundary
 * (CLAUDE.md — don't trust field shapes off the network) that validates + shapes
 * each raw row directly into the {@link StaticMarker} the map renders.
 *
 * Verified live field shape (dataset `farmacie`, 2026-07-11):
 *   { farmacia, civkey, indirizzo, area_stati, zona_pross, geo_point_2d {lon,lat} }.
 * Only the four consumed fields are validated; every other field is passed through
 * and ignored. A row without a usable `geo_point_2d` (absent, or non-finite /
 * out-of-range coordinates — a garbage or swapped-axis point) fails the row schema
 * and is SKIPPED by {@link makePageParser} — counted, never fatal — because a
 * static marker renders its coordinate DIRECTLY on the map, so a wrong pin is worse
 * than a missing one.
 */

/**
 * A `geo_point_2d` constrained to a finite, in-range WGS84 coordinate. `z.number()`
 * admits `NaN`, and the shared {@link geoPointSchema} does not range-check, so this
 * refine is load-bearing: it is what turns a junk / swapped-axis point into a
 * skipped row instead of a marker dropped in the ocean.
 */
const validGeoPoint = geoPointSchema.refine(
  (g) =>
    Number.isFinite(g.lat) &&
    Number.isFinite(g.lon) &&
    Math.abs(g.lat) <= 90 &&
    Math.abs(g.lon) <= 180,
  { message: 'coordinate non valide' }
);

/**
 * One `farmacie` row → a `farmacie` {@link StaticMarker}. `civkey` (stable id) and
 * `farmacia` (name) are required; the subtitle prefers the street address and falls
 * back to the proximity zone, so a row with a blank `indirizzo` still gets a useful
 * secondary line, and `null` only when BOTH are blank ({@link nullIfEmpty} folds the
 * ODS empty-string form to null so the `??` fallback fires).
 */
export const farmaciaRowSchema = z
  .object({
    civkey: z.string(),
    farmacia: z.string(),
    indirizzo: optNull(z.string()),
    zona_pross: optNull(z.string()),
    geo_point_2d: validGeoPoint,
  })
  .passthrough()
  .transform(
    (r): StaticMarker => ({
      id: r.civkey,
      lat: r.geo_point_2d.lat,
      lon: r.geo_point_2d.lon,
      layer: 'farmacie',
      title: r.farmacia,
      subtitle: nullIfEmpty(r.indirizzo) ?? nullIfEmpty(r.zona_pross),
      color: STATIC_LAYERS.farmacie.color,
    })
  );

/** Ingress parser for one `farmacie` page (shared envelope + per-row skip logic). */
export const parseFarmaciePage: (payload: unknown) => ParsedPage<StaticMarker> =
  makePageParser(farmaciaRowSchema);
