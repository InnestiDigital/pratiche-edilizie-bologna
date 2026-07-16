import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { geoPointSchema, nullIfEmpty } from './source-shared';
import { STATIC_LAYERS, type StaticMarker } from './static-layers';

/**
 * `scuole` — the Comune di Bologna school gazetteer (361 rows, fits in one ODS
 * page: no `MAX_OFFSET` pagination concern). The map's 2nd STATIC LAYER (after
 * `farmacie`), NOT a category: these rows never enter the `permits` table, the
 * feed, or the notifications — they are map-only reference points a family /
 * house-hunter toggles on to see schools near a permit (docs/ROADMAP.md §4b). This
 * module owns the INGRESS parse, mirroring `source-farmacie.ts`: a zod schema at
 * the network boundary (CLAUDE.md — don't trust field shapes off the network) that
 * validates + shapes each raw row directly into the {@link StaticMarker} the map
 * renders.
 *
 * Verified live field shape (dataset `elenco-delle-scuole`, 2026-07-16):
 *   { geo_id, civkey, nome, denominazi, civico, servizio, quartiere,
 *     geo_point_2d {lon,lat}, geo_shape }.
 * `geo_id` is the stable PER-ROW id — verified UNIQUE across all 361 rows (361
 * distinct), whereas `civkey` is a civic-ADDRESS key (only 292 distinct: two
 * schools at one address share it), so the marker is keyed on `geo_id` to avoid
 * multi-plesso collisions. Only the consumed fields are validated; every other
 * field is passed through and ignored. A row without a usable `geo_point_2d`
 * (absent, or non-finite / out-of-range coordinates) fails the row schema and is
 * SKIPPED by {@link makePageParser} — counted, never fatal — because a static
 * marker renders its coordinate DIRECTLY on the map, so a wrong pin is worse than
 * a missing one.
 */

/**
 * A `geo_point_2d` constrained to a finite, in-range WGS84 coordinate. `z.number()`
 * admits `NaN`, and the shared {@link geoPointSchema} does not range-check, so this
 * refine is load-bearing: it is what turns a junk / swapped-axis point into a
 * skipped row instead of a marker dropped in the ocean. (Mirrors the farmacie
 * refine — kept local so the two static-layer parsers stay independent modules.)
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
 * Build a school's callout subtitle: the street address (`denominazi` + optional
 * `civico`, e.g. "VIA DANTE 3"), falling back to the service type (`servizio`,
 * e.g. "SCUOLA DELL'INFANZIA") when the street is blank, then `null` when both are
 * blank. {@link nullIfEmpty} folds the ODS empty-string form to null so the `??`
 * fallback fires. The civico is appended only when both the street AND the number
 * are present, so a street-only row reads "VIA DANTE" (no trailing space).
 */
function scuolaSubtitle(
  denominazi: string | null | undefined,
  civico: string | null | undefined,
  servizio: string | null | undefined
): string | null {
  const street = nullIfEmpty(denominazi);
  if (street !== null) {
    const num = nullIfEmpty(civico);
    return num !== null ? `${street} ${num}` : street;
  }
  return nullIfEmpty(servizio);
}

/**
 * One `elenco-delle-scuole` row → a `scuole` {@link StaticMarker}. `geo_id` (stable
 * per-row id) and `nome` (school name) are required; the subtitle prefers the
 * street address and falls back to the service type ({@link scuolaSubtitle}).
 */
export const scuolaRowSchema = z
  .object({
    geo_id: z.string(),
    nome: z.string(),
    denominazi: optNull(z.string()),
    civico: optNull(z.string()),
    servizio: optNull(z.string()),
    geo_point_2d: validGeoPoint,
  })
  .passthrough()
  .transform(
    (r): StaticMarker => ({
      id: r.geo_id,
      lat: r.geo_point_2d.lat,
      lon: r.geo_point_2d.lon,
      layer: 'scuole',
      title: r.nome,
      subtitle: scuolaSubtitle(r.denominazi, r.civico, r.servizio),
      color: STATIC_LAYERS.scuole.color,
    })
  );

/** Ingress parser for one `scuole` page (shared envelope + per-row skip logic). */
export const parseScuolePage: (payload: unknown) => ParsedPage<StaticMarker> =
  makePageParser(scuolaRowSchema);
