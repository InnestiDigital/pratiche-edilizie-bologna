import { parseApiResponse, type ParsedPage } from './schemas';
import { normalizeRecord, type NormalizedPermit } from './normalize';
import { parseCantieriPage, normalizeCantiere } from './source-cantieri';
import { parseCommercioPage, normalizeCommercio } from './source-commercio';
import { parseEventiPage, normalizeEvento } from './source-eventi';
import { parseSegnalazioniPage, normalizeSegnalazione } from './source-segnalazioni';
import type { SourceKey } from './sources';

/**
 * The runtime behavior for one source: fetch-page JSON → validated, normalized
 * permits, in one call. This is the FUNCTION-dispatch layer the data-only
 * `sources.ts` registry deliberately does not carry (storing a normalize fn there
 * would make `normalize.ts ↔ sources.ts` a cycle). It is imported ONLY by
 * `sync.ts` (and its tests).
 *
 * Each source's page parser and normalizer are internally type-consistent within
 * its own `source-*.ts` module (both parametrized by that source's raw row type
 * `T`). {@link defineRuntime} composes the two so `T` is fully erased at this
 * boundary — the exposed `parseAndNormalize` speaks only `unknown` in and
 * `ParsedPage<NormalizedPermit>` out, so no `as` assertion is needed to line the
 * pair up and `sync.ts` never touches a raw row type. Parse once at the boundary,
 * pass the typed `NormalizedPermit` down.
 */
export interface SourceRuntime {
  readonly parseAndNormalize: (payload: unknown) => ParsedPage<NormalizedPermit>;
}

/**
 * Pair a source's page parser with its normalizer into a {@link SourceRuntime}.
 * The generic `T` (the source's raw row type) is captured here and erased in the
 * return type: `parsePage` yields `ParsedPage<T>`, `.results` is `T[]`, and each
 * `T` flows into `normalize` — all statically checked, no cast.
 */
function defineRuntime<T>(
  parsePage: (payload: unknown) => ParsedPage<T>,
  normalize: (raw: T) => NormalizedPermit
): SourceRuntime {
  return {
    parseAndNormalize: (payload: unknown): ParsedPage<NormalizedPermit> => {
      const page = parsePage(payload);
      return {
        results: page.results.map(normalize),
        totalCount: page.totalCount,
        skipped: page.skipped,
      };
    },
  };
}

/**
 * Every source key → its runtime. `satisfies Record<SourceKey, SourceRuntime>`
 * makes adding a `SOURCES` entry without a matching runtime here a compile error
 * (compiler-enforced completeness), and dropping one likewise. The edilizia keys
 * reuse the shared `parseApiResponse` + `normalizeRecord(key, …)`.
 */
export const SOURCE_RUNTIME = {
  pdc: defineRuntime(parseApiResponse, (raw) => normalizeRecord('pdc', raw)),
  scia: defineRuntime(parseApiResponse, (raw) => normalizeRecord('scia', raw)),
  cila: defineRuntime(parseApiResponse, (raw) => normalizeRecord('cila', raw)),
  lavori: defineRuntime(parseCantieriPage, normalizeCantiere),
  commercio: defineRuntime(parseCommercioPage, normalizeCommercio),
  eventi: defineRuntime(parseEventiPage, normalizeEvento),
  segnalazioni: defineRuntime(parseSegnalazioniPage, normalizeSegnalazione),
} as const satisfies Record<SourceKey, SourceRuntime>;
