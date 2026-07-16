import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { geoPointSchema, nullIfEmpty } from './source-shared';
import { STATIC_LAYERS, type StaticMarker } from './static-layers';

/**
 * `mercati` — the Comune di Bologna markets-and-fairs gazetteer (249 rows, fits in
 * one ODS page: no `MAX_OFFSET` pagination concern). The map's 3rd STATIC LAYER
 * (after `farmacie` and `scuole`), NOT a category: these rows never enter the
 * `permits` table, the feed, or the notifications — they are map-only reference
 * points a resident / house-hunter toggles on to see the rionali / farmers /
 * antiques markets and fairs near a permit (docs/ROADMAP.md §4b). This module owns
 * the INGRESS parse, mirroring `source-scuole.ts`: a zod schema at the network
 * boundary (CLAUDE.md — don't trust field shapes off the network) that validates +
 * shapes each raw row directly into the {@link StaticMarker} the map renders.
 *
 * Verified live field shape (dataset `mercati-e-fiere`, 2026-07-16):
 *   { denominazione, tipologia, tipologia_mercato, ubicazione, giorni_svolgimento,
 *     nome_quartiere, nome_zona, long, lat, geopoint {lon,lat}, zona_pross, … }.
 * Unlike farmacie/scuole this dataset has NO natural per-row id field, so the layer
 * config selects the ODS meta `recordid` (verified UNIQUE across all 249 rows: 249
 * distinct) and the marker is keyed on it — never on `denominazione`, which
 * repeats across the individual market rows. Because the fetch `select`s a field
 * subset (see `static-layers.ts::selectFields`), only those keys reach this parser;
 * a row without a usable `geopoint` (absent, or non-finite / out-of-range
 * coordinates) fails the row schema and is SKIPPED by {@link makePageParser} —
 * counted, never fatal — because a static marker renders its coordinate DIRECTLY on
 * the map, so a wrong pin is worse than a missing one.
 */

/**
 * A `geopoint` constrained to a finite, in-range WGS84 coordinate. `z.number()`
 * admits `NaN`, and the shared {@link geoPointSchema} does not range-check, so this
 * refine is load-bearing: it is what turns a junk / swapped-axis point into a
 * skipped row instead of a marker dropped in the ocean. (Mirrors the farmacie /
 * scuole refine — kept local so the three static-layer parsers stay independent.)
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
 * One `mercati-e-fiere` row → a `mercati` {@link StaticMarker}. `recordid` (the ODS
 * meta id, the layer's stable per-row key) and `denominazione` (the market name)
 * are required; the callout subtitle prefers the market's days (`giorni_svolgimento`
 * — the field a resident cares about: WHEN it runs) and falls back to the location
 * (`ubicazione`), then `null` when both are blank ({@link nullIfEmpty} folds the ODS
 * empty-string form to null so the `??` fallback fires).
 */
export const mercatoRowSchema = z
  .object({
    recordid: z.string(),
    denominazione: z.string(),
    giorni_svolgimento: optNull(z.string()),
    ubicazione: optNull(z.string()),
    geopoint: validGeoPoint,
  })
  .passthrough()
  .transform(
    (r): StaticMarker => ({
      id: r.recordid,
      lat: r.geopoint.lat,
      lon: r.geopoint.lon,
      layer: 'mercati',
      title: r.denominazione,
      subtitle: nullIfEmpty(r.giorni_svolgimento) ?? nullIfEmpty(r.ubicazione),
      color: STATIC_LAYERS.mercati.color,
    })
  );

/** Ingress parser for one `mercati` page (shared envelope + per-row skip logic). */
export const parseMercatoPage: (payload: unknown) => ParsedPage<StaticMarker> =
  makePageParser(mercatoRowSchema);
