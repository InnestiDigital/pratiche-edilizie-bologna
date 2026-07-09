import { z } from 'zod';
import { makePageParser, type ParsedPage } from './schemas';
import { geoPointSchema } from './source-shared';
import type { CiviciRecord } from './geocode-civici';

/**
 * `rifter_civici_pt` — the Comune di Bologna "Numeri civici" gazetteer: ~77 600
 * civic-number points, each with a `geo_point_2d {lat, lon}` plus the `codvia`
 * (street code) + `civico` (house number) join keys that let the app geocode a
 * coordinate-less EDILIZIA row on-device with NO external service
 * (docs/P4-map-radius.md §3). This module owns the INGRESS parse: a zod schema at
 * the network boundary (CLAUDE.md: don't trust field shapes off the network) that
 * validates + shapes each raw row into the {@link CiviciRecord} the pure
 * `geocode-civici.ts::buildCiviciIndex` consumes.
 *
 * It is the ingress half of the P4 "widen Nei dintorni to edilizia" slice: this
 * parser + `civici-backfill.ts::planCiviciBackfill` (the backfill decision) are
 * the vitest-gated cores; the device glue that pages the gazetteer over the
 * transport and applies the plan to SQLite is built on top of them.
 *
 * Only the three consumed fields are validated; a row missing any of them (a
 * point with no coordinate, or a letter-suffixed `civico` like `12/A` that cannot
 * join a numeric edilizia `civico`) fails the row schema and is SKIPPED by
 * {@link makePageParser} — counted, never fatal — so junk points cannot poison the
 * index while the page still yields its usable civici.
 */

/**
 * One gazetteer row. `codvia` + `civico` are the numeric join keys and
 * `geo_point_2d` is the coordinate; every other field (indirizzo_completo,
 * quartiere, zona, cap, …) is passed through and ignored. `civico` tolerates the
 * ODS numeric-string form but rejects a letter suffix — a `12/A` civic cannot
 * match the numeric edilizia `civico`, so admitting it would only add a key that
 * never joins. The transform flattens the geo-point into flat `lat`/`lon`, so the
 * schema output IS a {@link CiviciRecord}.
 */
export const civiciRowSchema = z
  .object({
    codvia: z.number(),
    civico: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]),
    geo_point_2d: geoPointSchema,
  })
  .passthrough()
  .transform(
    (r): CiviciRecord => ({
      codvia: r.codvia,
      civico: r.civico,
      lat: r.geo_point_2d.lat,
      lon: r.geo_point_2d.lon,
    })
  );

/** Ingress parser for one `rifter_civici_pt` page (shared envelope + skip logic). */
export const parseCiviciPage: (payload: unknown) => ParsedPage<CiviciRecord> =
  makePageParser(civiciRowSchema);
