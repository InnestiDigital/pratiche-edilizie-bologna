import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { normalizeQuartiere } from './quartiere-normalize';
import { normalizeStatus, type NormalizedPermit } from './normalize';
import { SOURCES } from './sources';
import { compactExtra, portalTableSearchLink } from './source-shared';

/**
 * `istanze-commercio` — Comune di Bologna commercial-activity filings (aperture /
 * modifiche di esercizi commerciali). ~111k rows total, so it is swept per year
 * over a `data_richiesta` date-range `where` (there is no exact-year facet like
 * edilizia's `richiesta_anno_prot`); see `SOURCES.commercio.sweep`. Schema
 * validation lives at the sync ingress boundary (CLAUDE.md: don't trust field
 * shapes off the network); normalization maps a raw row to {@link NormalizedPermit}.
 *
 * The `SOURCES.commercio` registry entry (data-only) owns this source's category /
 * `filing_type` token / slug / sweep; this module owns its zod schema + parser +
 * normalizer, and `source-runtime.ts` (added by the sync-orchestration step) pairs
 * the two — this module is not yet wired into `sync.ts`.
 */

/**
 * One `istanze-commercio` row. This dataset has NO bare `id` field (verified live);
 * identity is derived from `n_e_anno_prot_domanda`, the pre-combined
 * "<protocollo> / <anno>" string (e.g. `'416143 / 2018'`) — so it is the sole
 * required field. A row without it cannot be addressed and is skipped by the
 * per-row parser. Every other consumed field is nullable (`optNull`); unknown
 * fields (zona, area_statistica, geopoint, lat/lon, …) pass through untouched.
 *
 * A live probe confirmed absent fields serialize as JSON `null` (not the Python
 * `str(None)` literal `'None'` that shows up when the ground-truth samples are
 * printed), so no `'None'`→null transform is applied.
 */
export const commercioRowSchema = z
  .object({
    n_e_anno_prot_domanda: z.string().min(1),
    data_richiesta: optNull(z.string()),
    esito_pratica: optNull(z.string()),
    data_fine_procedimento: optNull(z.string()),
    tipo_intervento: optNull(z.string()),
    tipo_pratica: optNull(z.string()),
    area: optNull(z.string()),
    sottoarea: optNull(z.string()),
    esercizio_via: optNull(z.string()),
    esercizio_civico: optNull(z.number()),
    esponente1: optNull(z.string()),
    quartiere: optNull(z.string()),
  })
  .passthrough();

export type CommercioRow = z.output<typeof commercioRowSchema>;

/** Ingress parser for an `istanze-commercio` page (shared envelope + skip logic). */
export const parseCommercioPage: (payload: unknown) => ParsedPage<CommercioRow> =
  makePageParser(commercioRowSchema);

/**
 * Split the pre-combined `n_e_anno_prot_domanda` ('416143 / 2018') into its
 * protocol number and year parts. Returns `null` when the string does not split
 * into exactly two non-empty parts, so the caller can fall back to a stable id
 * built from the raw string rather than throwing on an unexpected shape.
 */
function parseProtocol(raw: string): { prot: string; anno: string } | null {
  const parts = raw.split('/').map((p) => p.trim());
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return null;
  }
  return { prot: parts[0], anno: parts[1] };
}

export function normalizeCommercio(raw: CommercioRow): NormalizedPermit {
  const parsed = parseProtocol(raw.n_e_anno_prot_domanda);
  // Stable identity: `commercio-<anno>-<prot>` mirrors the edilizia
  // `dataset-year-number` source-id shape (so protocol group-matching works on
  // it for free). If the protocol string does not split cleanly, fall back to a
  // whitespace-stripped form — still stable and unique, never a thrown error.
  const source_id = parsed
    ? `commercio-${parsed.anno}-${parsed.prot}`
    : `commercio-${raw.n_e_anno_prot_domanda.replace(/\s+/g, '')}`;
  // The portal table search targets the protocol number when available.
  const query = parsed ? parsed.prot : raw.n_e_anno_prot_domanda.replace(/\s+/g, '');

  // Compose the address from the exercise location parts, dropping absent ones
  // (esercizio_civico is a number). Empty → null, which the card renders as
  // "no address" rather than a bogus blank string.
  const addressParts = [raw.esercizio_via, raw.esercizio_civico, raw.esponente1]
    .filter((v): v is string | number => v != null)
    .map(String);
  const address = addressParts.length > 0 ? addressParts.join(' ') : null;

  return {
    dataset: 'commercio',
    source_id,
    filing_type: SOURCES.commercio.filingTypeToken, // 'COMMERCIO'
    category: SOURCES.commercio.category, // 'commercio'
    // Primary date = request date (already YYYY-MM-DD); secondary = procedure close.
    source_updated_at: raw.data_richiesta,
    date_issued: raw.data_fine_procedimento,
    address,
    zone: normalizeQuartiere(raw.quartiere),
    codvia: null,
    procedimento: null,
    // Reuse the shared edilizia status vocabulary untouched — commercio is the
    // same istanza→esito shape ('efficace'→rilasciata, etc.); "chiusura d'ufficio"
    // falls to 'altro' (acceptable v1, do NOT extend the shared STATUS_PATTERNS).
    status: normalizeStatus(raw.esito_pratica),
    status_raw: raw.esito_pratica ?? '',
    tags: '[]',
    source_link: portalTableSearchLink('commercio', query),
    title: raw.tipo_intervento,
    // Only non-null, non-empty extra keys are stored, so the on-device decoder
    // never sees a JSON `null` where it expects an optional string.
    extra: compactExtra({
      area: raw.area,
      sottoarea: raw.sottoarea,
      tipo_pratica: raw.tipo_pratica,
    }),
  };
}
