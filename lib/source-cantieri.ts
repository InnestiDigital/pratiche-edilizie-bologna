import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { normalizeQuartiere } from './quartiere-normalize';
import { SOURCES } from './sources';
import {
  compactExtra,
  coordsToExtra,
  geoPointSchema,
  portalTableSearchLink,
  toIsoDate,
} from './source-shared';
import type { NormalizedPermit } from './normalize';

/**
 * `lavori-pubblici` — Comune di Bologna public-works / roadwork sites (cantieri
 * stradali). ~50 rows total. Schema validation lives at the sync ingress
 * boundary (CLAUDE.md: don't trust field shapes off the network); normalization
 * maps a raw row to the shared {@link NormalizedPermit} shape.
 *
 * The `SOURCES.lavori` registry entry (data-only) owns this source's category /
 * `filing_type` token / slug / sweep; this module owns its zod schema + parser +
 * normalizer. `source-runtime.ts` (added by the sync-orchestration step) pairs
 * the two — this module is not yet wired into `sync.ts`.
 */

/**
 * One `lavori-pubblici` row. Only `id` is required — it is the stable, dataset-
 * prefixed source id; a row without it cannot be addressed and is skipped by the
 * per-row parser. Every other consumed field is nullable (`optNull`). Unknown
 * fields (geo points, roadway/address-number breakdowns, year, neighborhood2/3)
 * pass through untouched.
 *
 * The verified live sample carried real JSON values (not the Python `str(None)`
 * literal `'None'` that shows up in some other Bologna datasets), so no
 * `'None'`→null transform is applied here.
 */
export const cantiereRowSchema = z
  .object({
    id: z.number(),
    status: optNull(z.string()),
    address: optNull(z.string()),
    description: optNull(z.string()),
    trafficchangesmeasure: optNull(z.string()),
    neighborhood1: optNull(z.string()),
    effectivestartdate: optNull(z.string()),
    effectiveenddate: optNull(z.string()),
    visualizationnotes: optNull(z.string()),
    // Roadwork site geo-point `{ lon, lat }` — extracted into `extra` for the P4
    // map; absent/malformed points normalize to null (see coordsToExtra).
    pinpoint: optNull(geoPointSchema),
  })
  .passthrough();

export type CantiereRow = z.output<typeof cantiereRowSchema>;

/** Ingress parser for a `lavori-pubblici` page (shared envelope + skip logic). */
export const parseCantieriPage: (payload: unknown) => ParsedPage<CantiereRow> =
  makePageParser(cantiereRowSchema);

/**
 * Map a cantiere `status` to the app's normalized status vocabulary. Deliberately
 * a tiny source-local list — extending the shared `STATUS_PATTERNS` in
 * `constants.ts` could reclassify edilizia rows, so cantieri status stays here.
 */
function normalizeCantiereStatus(raw: string | null): string {
  if (!raw) return 'altro';
  const s = raw.trim().toLowerCase();
  if (s.includes('in corso')) return 'in_corso';
  if (s.includes('conclus') || s.includes('terminat')) return 'concluso';
  return 'altro';
}

export function normalizeCantiere(raw: CantiereRow): NormalizedPermit {
  const coords = coordsToExtra(raw.pinpoint);
  return {
    dataset: 'lavori',
    source_id: `lavori-${raw.id}`,
    filing_type: SOURCES.lavori.filingTypeToken, // 'CANTIERE'
    category: SOURCES.lavori.category, // 'cantieri'
    // Primary date = start of works; secondary/closing date = end of works.
    source_updated_at: toIsoDate(raw.effectivestartdate),
    date_issued: toIsoDate(raw.effectiveenddate),
    address: raw.address,
    zone: normalizeQuartiere(raw.neighborhood1),
    codvia: null,
    procedimento: null,
    status: normalizeCantiereStatus(raw.status),
    status_raw: raw.status ?? '',
    tags: '[]',
    // Generic portal table search — the edilizia BOLOGNA_PORTAL_BASE refine
    // template is edilizia-specific (richiesta_anno_prot), so cantieri use a
    // plain full-text query on the stable id instead.
    source_link: portalTableSearchLink('lavori', String(raw.id)),
    title: raw.description,
    // Only non-null, non-empty extra keys are stored, so the on-device decoder
    // never sees a JSON `null` where it expects an optional string.
    extra: compactExtra({
      trafficchangesmeasure: raw.trafficchangesmeasure,
      lat: coords.lat,
      lon: coords.lon,
    }),
  };
}
