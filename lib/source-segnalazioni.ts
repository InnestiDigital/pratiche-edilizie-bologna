import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { normalizeQuartiere } from './quartiere-normalize';
import { SOURCES } from './sources';
import { compactExtra, portalTableSearchLink, toIsoDate } from './source-shared';
import type { NormalizedPermit } from './normalize';

/**
 * `segnalazioni-open-citizen-relationship-management-czrm` — Comune di Bologna
 * citizen reports (CRM tickets: viabilità, verde, degrado urbano, …). ~124k rows
 * total, over the `MAX_OFFSET` cap, and the dataset exposes NO exact-year facet —
 * so it is swept per year (over-cap ranges recursively bisected) via an
 * ODS-QL half-open `where` on the `data_inserimento` datetime field, recent-window
 * oriented like edilizia (`SOURCES.segnalazioni.sweep`).
 *
 * The `SOURCES.segnalazioni` registry entry (data-only) owns this source's
 * category / `filing_type` token / slug / sweep; this module owns its zod schema +
 * parser + normalizer, and `source-runtime.ts` (added by the sync-orchestration
 * step) pairs the two — this module is not yet wired into `sync.ts`.
 */

/**
 * The ODS filler value that stands in for an absent drill-down level in the
 * `sottocategoria_*` chain (a live probe confirms it literally, e.g. a
 * `sottocategoria_02` of `'Non definita'`). It is dropped from the report title so
 * the headline shows only the real report type.
 */
const UNDEFINED_SUBCATEGORY = 'non definita';

/**
 * One `segnalazioni-czrm` row. `ticketid` (the stable, dataset-prefixed source id)
 * is the sole required field — tolerated as a number (coerced to string) or a
 * string — and a row missing it cannot be addressed, so it is skipped by the
 * per-row parser. This dataset has NO address field at all (reports are geo-located
 * via `geopoint`/`latitude`/`longitude` plus `quartiere` / `nome_zona_prossimita`),
 * so the schema does not invent one. Every other consumed field is nullable
 * (`optNull`); unknown fields (geopoint, lat/lon, nome_area_statistica, …) pass
 * through untouched.
 *
 * A live probe confirmed absent drill-down levels serialize as the literal string
 * `'Non definita'` (filtered out of the title) and other absent fields as JSON
 * `null` — not the Python `str(None)` literal `'None'` — so no `'None'`→null
 * transform is applied.
 */
export const segnalazioneRowSchema = z
  .object({
    ticketid: z.union([z.number().transform((n) => String(n)), z.string()]),
    quartiere: optNull(z.string()),
    data_inserimento: optNull(z.string()),
    sottocategoria_01: optNull(z.string()),
    sottocategoria_02: optNull(z.string()),
    sottocategoria_03: optNull(z.string()),
    nome_zona_prossimita: optNull(z.string()),
    categoria_segnalazione: optNull(z.string()),
  })
  .passthrough();

export type SegnalazioneRow = z.output<typeof segnalazioneRowSchema>;

/** Ingress parser for a `segnalazioni-czrm` page (shared envelope + skip logic). */
export const parseSegnalazioniPage: (payload: unknown) => ParsedPage<SegnalazioneRow> =
  makePageParser(segnalazioneRowSchema);

/**
 * Build the report headline from the `sottocategoria_*` drill-down chain — the
 * real report type lives here (e.g. `'Verde privato · Alberi/rami · Invadenti'`).
 * Absent (`null`) and filler (`'Non definita'`) levels are dropped; when nothing
 * is left, fall back to the generic `'Segnalazione'` so the card always has a
 * headline.
 */
function buildTitle(raw: SegnalazioneRow): string {
  const chain = [raw.sottocategoria_01, raw.sottocategoria_02, raw.sottocategoria_03]
    .filter((v): v is string => v != null)
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.toLowerCase() !== UNDEFINED_SUBCATEGORY);
  return chain.length > 0 ? chain.join(' · ') : 'Segnalazione';
}

export function normalizeSegnalazione(raw: SegnalazioneRow): NormalizedPermit {
  return {
    dataset: 'segnalazioni',
    source_id: `segnalazioni-${raw.ticketid}`,
    filing_type: SOURCES.segnalazioni.filingTypeToken, // 'SEGNALAZIONE'
    category: SOURCES.segnalazioni.category, // 'segnalazioni'
    // Primary date = report insertion (a DATETIME, sliced to YYYY-MM-DD); there is
    // no resolution/closing date in this dataset, so the secondary date is null.
    source_updated_at: toIsoDate(raw.data_inserimento),
    date_issued: null,
    // No address field exists in this dataset — always null. The card renders the
    // `nome_zona_prossimita` from `extra` as the location line instead, and must
    // NOT fall back to the edilizia "Indirizzo non disponibile" placeholder.
    address: null,
    zone: normalizeQuartiere(raw.quartiere),
    codvia: null,
    procedimento: null,
    // The dataset exposes no outcome field — do not fabricate one. Constant 'altro'
    // with an empty raw status (never time-derived, so it can't go stale).
    status: 'altro',
    status_raw: '',
    // The report type lives in the title (the sottocategoria chain); duplicating
    // sottocategoria_01 into tags would be a second source of truth — skipped.
    tags: '[]',
    source_link: portalTableSearchLink('segnalazioni', String(raw.ticketid)),
    title: buildTitle(raw),
    // Only non-null, non-empty extra keys are stored, so the on-device decoder
    // never sees a JSON `null` where it expects an optional string.
    // `nome_zona_prossimita` is the only human-readable location this source
    // carries (there is no address).
    extra: compactExtra({
      sottocategoria_01: raw.sottocategoria_01,
      sottocategoria_02: raw.sottocategoria_02,
      sottocategoria_03: raw.sottocategoria_03,
      nome_zona_prossimita: raw.nome_zona_prossimita,
    }),
  };
}
