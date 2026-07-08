import { DATASETS, type DatasetKey } from './constants';

/**
 * The civic categories this app can browse. It began as building permits only
 * (`edilizia`) and now spans five Comune di Bologna open-data domains. Adding a
 * member here automatically widens the `Category` union — and, because the
 * `CATEGORY_*` maps below are exhaustive `Record<Category, …>`, forces the build
 * to fail until the new category gets a label / color / notification noun.
 *
 * Single source of truth for: the `Category` TS union, the `allowed` list handed
 * to preferences' `decodeEnumArray`, and any UI iteration over categories.
 * Mirrors the `QUARTIERI` / `Quartiere` pattern in `constants.ts`. All keys are
 * lowercase Italian, matching the app's all-Italian-copy convention.
 */
export const CATEGORIES = ['edilizia', 'cantieri', 'commercio', 'eventi', 'segnalazioni'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * The category assumed for pre-category rows when the `permits.category` column is
 * backfilled by migration — every existing row is a building permit, so `edilizia`
 * is permanently correct for the backfill. Post-migration inserts always write
 * `category` explicitly from the source registry.
 */
export const DEFAULT_CATEGORY: Category = 'edilizia';

/**
 * Human-readable Italian label for each category (badge text, settings rows,
 * onboarding checkboxes). Exhaustive `Record<Category, …>`: single source of
 * truth, mirroring `FILING_TYPE_LABELS` in `constants.ts`.
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  edilizia: 'Edilizia',
  cantieri: 'Cantieri',
  commercio: 'Commercio',
  eventi: 'Eventi',
  segnalazioni: 'Segnalazioni',
};

/**
 * Header title for the permit-detail screen, per category. Since the rebrand to
 * "Civico" the app is category-neutral (five open-data domains, not just building
 * permits), so a hard-coded "Dettaglio Pratica" mislabels a cantiere / evento /
 * segnalazione. Each category names what it actually is; the detail screen reads
 * this off the loaded row's `category`. Exhaustive `Record<Category, …>` so a new
 * category cannot ship without deciding its detail-screen title.
 */
export const CATEGORY_DETAIL_TITLE: Record<Category, string> = {
  edilizia: 'Dettaglio Pratica',
  cantieri: 'Dettaglio Cantiere',
  commercio: 'Dettaglio Attività',
  eventi: 'Dettaglio Evento',
  segnalazioni: 'Dettaglio Segnalazione',
};

/**
 * The per-category soft-badge palette (parchment-toned, matching `FILING_COLORS`
 * in `constants.ts`). `bg` is the soft badge fill, `text` the saturated accent
 * (also used as a leading dot/marker color). Exhaustive `Record<Category, …>` so
 * a new category cannot ship without its color pair.
 */
export const CATEGORY_COLORS: Record<Category, { bg: string; text: string }> = {
  edilizia: { bg: '#FDF3E3', text: '#8B5E1A' }, // brick (reuses the edilizia family)
  cantieri: { bg: '#FBEFD8', text: '#9A6B12' }, // amber
  commercio: { bg: '#E4EFE4', text: '#2F6B3A' }, // green
  eventi: { bg: '#EDE7F3', text: '#5B3D82' }, // violet
  segnalazioni: { bg: '#E7EAEE', text: '#41525F' }, // slate
};

/**
 * Italian noun phrases for the "N new …" notification body, per category, WITHOUT
 * the leading count. `notification-message.ts` renders `${count} ${singularNew}`
 * ("1 nuova pratica", "1 nuovo cantiere") or `${count} ${pluralNew}` ("3 nuove
 * pratiche", "3 nuovi cantieri"), so every entry omits the count and lets the
 * builder prepend it uniformly. Exhaustive `Record<Category, …>`: adding a category
 * without a noun fails the build.
 */
export const CATEGORY_NOUNS: Record<Category, { singularNew: string; pluralNew: string }> = {
  edilizia: { singularNew: 'nuova pratica', pluralNew: 'nuove pratiche' },
  cantieri: { singularNew: 'nuovo cantiere', pluralNew: 'nuovi cantieri' },
  commercio: { singularNew: 'nuova attività', pluralNew: 'nuove attività' },
  eventi: { singularNew: 'nuovo evento', pluralNew: 'nuovi eventi' },
  segnalazioni: { singularNew: 'nuova segnalazione', pluralNew: 'nuove segnalazioni' },
};

/**
 * Whether a category's stored `status` carries real signal (the feed card shows
 * a status dot + label). Eventi/segnalazioni statuses are constants written by
 * their normalizers ('in_programma' / 'altro') — no signal. Exhaustive
 * `Record<Category, boolean>`: a sixth category cannot ship without making this
 * decision explicitly (rather than silently defaulting to no status dot).
 */
export const CATEGORY_HAS_STATUS_SIGNAL: Record<Category, boolean> = {
  edilizia: true,
  cantieri: true,
  commercio: true,
  eventi: false,
  segnalazioni: false,
};

/**
 * ODS `refine` facet field used to scope an edilizia query to one filing year.
 * Lives here (not in `ods-request.ts`) so the year-refine field name is declared
 * once — `ods-request.ts` re-exports it and `buildPageParams` builds its refine
 * string from it. The `year-refine` sweep strategy carries no `field` of its own
 * (there is only one year facet in the ODS, this constant), so there is nothing
 * to embed. A silent typo returns an unrefined (or empty) page with no error, so
 * it stays behind a single constant.
 */
export const YEAR_REFINE_FIELD = 'richiesta_anno_prot';

/**
 * How a source is swept out of the ODS API. A discriminated union so the fetch
 * layer's `switch (sweep.kind)` can be made exhaustive (assertNever on `default`).
 *
 * - `full`: single plain `limit/offset` walk, no refine/where (tiny datasets).
 * - `year-refine`: per-year walk via the ODS `refine` facet on the single
 *   `YEAR_REFINE_FIELD` (edilizia's `richiesta_anno_prot`, consumed by
 *   `ods-request`'s `buildPageParams`), for datasets over the `MAX_OFFSET` cap
 *   that expose an exact-year facet. Carries no `field` of its own.
 * - `date-range`: per-year walk via an ODS-QL half-open `where` on a date `field`,
 *   for large datasets with no year facet (an over-cap range is recursively
 *   bisected via `bisectRange` until each half fits under the cap).
 * - `future-window`: single forward-looking `where` on a date `field`, keeping only
 *   records from `lookBackDays` ago onward (events).
 */
export type SweepStrategy =
  | { readonly kind: 'full' }
  | { readonly kind: 'year-refine' }
  | { readonly kind: 'date-range'; readonly field: string }
  | { readonly kind: 'future-window'; readonly field: string; readonly lookBackDays: number };

/**
 * Configuration for one open-data source feeding the local database. DATA ONLY:
 * no zod schema refs and no normalize function refs live here, so `sources.ts`
 * stays a leaf module (imported by `normalize.ts`, `schema-migrations.ts`,
 * `preferences.ts`, `build-feed-query.ts`, `queries.ts`, `screenshot-fixtures.ts`).
 * The per-source page-parser + normalizer pairing lives in `source-runtime.ts` to
 * avoid a `normalize ↔ sources` import cycle.
 */
export interface SourceConfig {
  /** ODS dataset slug on opendata.comune.bologna.it */
  readonly slug: string;
  /** Civic category this source's records belong to */
  readonly category: Category;
  /** Italian progress/UI label for this source, e.g. 'Cantieri stradali'. */
  readonly label: string;
  /**
   * Constant stored in `permits.filing_type`: 'PDC' | 'SCIA' | 'CILA' for the
   * edilizia keys, an uppercase category token ('CANTIERE', …) for the others.
   */
  readonly filingTypeToken: string;
  /** How this source is swept out of the ODS API. */
  readonly sweep: SweepStrategy;
  /**
   * First year swept by a `date-range` / `year-refine` full scan (default 2000).
   * Only meaningful for those strategies.
   */
  readonly fullScanFromYear?: number;
}

/**
 * The source registry: each source key → its ODS slug, civic category, UI label,
 * `filing_type` token and sweep strategy. `normalizeRecord` reads
 * `SOURCES[key].category`/`filingTypeToken` to stamp each permit — the one place
 * the dataset→category/token/slug/sweep mapping lives.
 *
 * Typed `Record<string, SourceConfig>` (not `Record<DatasetKey, …>`) so later
 * phases can add non-edilizia keys by appending entries; the compile-time
 * coverage assertion below keeps the edilizia keys in lock-step with `DATASETS`.
 */
export const SOURCES = {
  pdc: {
    slug: DATASETS.pdc.slug,
    category: 'edilizia',
    label: DATASETS.pdc.label,
    filingTypeToken: DATASETS.pdc.filingType,
    sweep: { kind: 'year-refine' },
  },
  scia: {
    slug: DATASETS.scia.slug,
    category: 'edilizia',
    label: DATASETS.scia.label,
    filingTypeToken: DATASETS.scia.filingType,
    sweep: { kind: 'year-refine' },
  },
  cila: {
    slug: DATASETS.cila.slug,
    category: 'edilizia',
    label: DATASETS.cila.label,
    filingTypeToken: DATASETS.cila.filingType,
    sweep: { kind: 'year-refine' },
  },
  lavori: {
    // Public-works / roadwork sites (cantieri stradali). Only ~50 rows total, so
    // both recent and full syncs are a single plain limit/offset walk — no refine,
    // no where clause, no pagination concerns (`sweep: { kind: 'full' }`).
    slug: 'lavori-pubblici',
    category: 'cantieri',
    label: 'Cantieri stradali',
    filingTypeToken: 'CANTIERE',
    sweep: { kind: 'full' },
  },
  commercio: {
    // Commercial-activity filings (aperture/modifiche esercizi). ~111k rows, over
    // the MAX_OFFSET cap, and the dataset exposes NO exact-year facet — so it is
    // swept per year via an ODS-QL half-open `where` on the `data_richiesta` date
    // field (`sweep: { kind: 'date-range', field: 'data_richiesta' }`), not the
    // edilizia `refine` facet. `fullScanFromYear` defaults to 2000.
    slug: 'istanze-commercio',
    category: 'commercio',
    label: 'Attività commerciali',
    filingTypeToken: 'COMMERCIO',
    sweep: { kind: 'date-range', field: 'data_richiesta' },
  },
  eventi: {
    // Cultural-events agenda. ~30k rows total, but a FORWARD-looking feed: swept
    // with a `future-window` `where` on the `start` date, keeping only events from
    // `lookBackDays` (7) ago onward (a live probe returned ~560 future rows, well
    // under the MAX_OFFSET cap, so a single plain walk suffices). Most of the 30k
    // historical events are never fetched.
    slug: 'eventi-bologna-agenda-cultura',
    category: 'eventi',
    label: 'Eventi culturali',
    filingTypeToken: 'EVENTO',
    sweep: { kind: 'future-window', field: 'start', lookBackDays: 7 },
  },
  segnalazioni: {
    // Citizen reports (CRM tickets). ~124k rows, over the MAX_OFFSET cap, with no
    // exact-year facet — swept per year (over-cap ranges recursively bisected) via an
    // ODS-QL half-open `where` on the `data_inserimento` datetime field, recent-
    // window oriented like edilizia. `fullScanFromYear` 2015 (samples start ~2018;
    // a few empty probe years cost one request each).
    slug: 'segnalazioni-open-citizen-relationship-management-czrm',
    category: 'segnalazioni',
    label: 'Segnalazioni civiche',
    filingTypeToken: 'SEGNALAZIONE',
    sweep: { kind: 'date-range', field: 'data_inserimento' },
    fullScanFromYear: 2015,
  },
} as const satisfies Record<string, SourceConfig>;

/** Every source key in the registry (edilizia today; widens as sources are added). */
export type SourceKey = keyof typeof SOURCES;

/**
 * Compile-time guarantee that every edilizia `DatasetKey` has a `SOURCES` entry.
 * Because `SOURCES` is typed `Record<string, SourceConfig>` (to admit non-edilizia
 * keys), this assignment is what keeps the edilizia registry in lock-step with
 * `DATASETS`: drop a dataset key from `SOURCES` and this line stops compiling.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ediliziaCovered: Record<DatasetKey, SourceConfig> = SOURCES;
