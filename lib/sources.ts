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
 * Plain-Italian one-line explainer of what each category's records ARE, for the
 * detail-screen "Che cos'è" card. Edilizia rows get the richer per-filing-type
 * explainer (`FILING_TYPE_DESCRIPTIONS` — PDC vs SCIA vs CILA differ and matter),
 * so its entry here is the neutral fallback and normally unused; every OTHER
 * category has no filing-type nuance, so this is the card that keeps a cantiere /
 * commercio / evento / segnalazione detail from feeling thinner than an edilizia
 * one (previously they showed only a bare uppercase "Dataset" row). Neutral,
 * jargon-free, no legal references — the sibling of `FILING_TYPE_DESCRIPTIONS`.
 * Exhaustive `Record<Category, …>`: a new category cannot ship without one.
 */
export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  edilizia: 'Titoli e pratiche edilizie presentati al Comune di Bologna.',
  cantieri:
    'Cantieri e lavori stradali del Comune, in corso o in programma sul territorio cittadino.',
  commercio:
    'Aperture, subingressi e modifiche di attività commerciali comunicati al Comune di Bologna.',
  eventi: 'Eventi culturali in programma a Bologna, dall’agenda ufficiale del Comune.',
  segnalazioni:
    'Segnalazioni inviate dai cittadini al Comune attraverso il servizio di relazione con il pubblico.',
};

/**
 * Per-category labels for the detail-screen "Cronologia" timeline. The stored
 * `source_updated_at` and `date_issued` columns hold DIFFERENT real-world dates
 * per source — for edilizia they are the filing request + closing, but for a
 * cantiere they are the works' start + end, for an evento the event's end date,
 * for a segnalazione the report date. So a single edilizia-flavored label
 * ("Richiesta presentata" / "Pratica conclusa") mislabels every other category —
 * most visibly an evento whose "In programma" status contradicts a "Pratica
 * conclusa" timeline row. Each category names what its two dates actually are:
 * `richiesta` = the `source_updated_at` event, `chiusura` = the `date_issued`
 * event. (The third timeline event, "Rilevata dall'app" from `first_seen_at`, is
 * category-independent and stays hard-coded in `buildPermitTimeline`.) Exhaustive
 * `Record<Category, …>`: a new category cannot ship without naming its dates.
 *
 * `chiusuraKind` says what the `chiusura` date MEANS, which drives its timeline
 * marker: `completion` is a real conclusion (green check — the filing/procedure
 * closed), `scheduled` is a plain calendar date that has NOT necessarily happened
 * (an evento's future "Data dell'evento", a cantiere's planned "Fine lavori"). A
 * green done-check on a future evento ("In programma") reads as a contradiction —
 * so `scheduled` gets a neutral calendar marker instead.
 */
export const CATEGORY_TIMELINE_LABELS: Record<
  Category,
  { richiesta: string; chiusura: string; chiusuraKind: 'completion' | 'scheduled' }
> = {
  edilizia: {
    richiesta: 'Richiesta presentata',
    chiusura: 'Pratica conclusa',
    chiusuraKind: 'completion',
  },
  cantieri: { richiesta: 'Inizio lavori', chiusura: 'Fine lavori', chiusuraKind: 'scheduled' },
  commercio: {
    richiesta: 'Richiesta presentata',
    chiusura: 'Procedimento concluso',
    chiusuraKind: 'completion',
  },
  eventi: { richiesta: 'Data richiesta', chiusura: "Data dell'evento", chiusuraKind: 'scheduled' },
  segnalazioni: {
    richiesta: 'Segnalazione inviata',
    chiusura: 'Pratica conclusa',
    chiusuraKind: 'completion',
  },
};

/**
 * Prefix for the detail-screen identifier line (the number under the address).
 * The stored `source_id` means DIFFERENT things per source: for edilizia and
 * commercio it is a real administrative **protocollo** (edilizia protocollo /
 * commercio `n. e anno protocollo domanda`), so "Prot." is truthful. But a
 * cantiere (`lavori-<id>`), an evento (`eventi-<id>`) and a segnalazione
 * (`segnalazioni-<ticketid>`) carry an open-data **record/ticket id**, NOT a
 * protocollo — labelling those "Prot." is edilizia copy bleeding into every
 * category (the same class as `CATEGORY_DETAIL_TITLE` / `CATEGORY_TIMELINE_LABELS`).
 * They get the neutral "Rif." (riferimento). Exhaustive `Record<Category, …>`: a
 * new category cannot ship without deciding whether its id is a protocollo.
 */
export const CATEGORY_REFERENCE_LABEL: Record<Category, string> = {
  edilizia: 'Prot.',
  cantieri: 'Rif.',
  commercio: 'Prot.',
  eventi: 'Rif.',
  segnalazioni: 'Rif.',
};

/**
 * Full-word form of {@link CATEGORY_REFERENCE_LABEL} for prose surfaces (the
 * shared/pasted text), where the compact "Prot." / "Rif." abbreviations of the
 * detail line read as cramped. Same per-category decision — a protocollo is a
 * protocollo, a record id is a riferimento — just spelled out. Kept exhaustive
 * so it can never drift out of sync with the abbreviated map.
 */
export const CATEGORY_REFERENCE_LABEL_LONG: Record<Category, string> = {
  edilizia: 'Protocollo',
  cantieri: 'Riferimento',
  commercio: 'Protocollo',
  eventi: 'Riferimento',
  segnalazioni: 'Riferimento',
};

/**
 * The per-category soft-badge palette (parchment-toned, matching `FILING_COLORS`
 * in `constants.ts`). `bg` is the soft badge fill, `text` the saturated accent
 * (also used as a leading dot/marker color). Exhaustive `Record<Category, …>` so
 * a new category cannot ship without its color pair.
 */
export const CATEGORY_COLORS: Record<Category, { bg: string; text: string }> = {
  edilizia: { bg: '#FDF3E3', text: '#8B5E1A' }, // olive-gold (the edilizia family)
  cantieri: { bg: '#FCE7CF', text: '#B45309' }, // orange-amber — hue-shifted off edilizia's gold so the two adjacent warm categories stay distinct as an 8px dot / a selected pill fill (they were near-identical before)
  commercio: { bg: '#E4EFE4', text: '#2F6B3A' }, // green
  eventi: { bg: '#EDE7F3', text: '#5B3D82' }, // violet
  segnalazioni: { bg: '#E7EAEE', text: '#41525F' }, // slate
};

/**
 * Italian noun phrases for the "N new …" notification body, per category, WITHOUT
 * the leading count. `notification-message.ts` renders `${count} ${singularNew}`
 * ("1 nuova pratica", "1 nuovo cantiere") or `${count} ${pluralNew}` ("3 nuove
 * pratiche", "3 nuovi cantieri"), so every entry omits the count and lets the
 * builder prepend it uniformly. `singularNoun`/`pluralNoun` are the bare nouns
 * WITHOUT the "nuova/nuove/nuovi" adjective ("pratica"/"pratiche", "cantiere"/
 * "cantieri") — used where a count qualifies the record type without the "new"
 * framing, e.g. the map coverage chip's "8 pratiche senza posizione". Exhaustive
 * `Record<Category, …>`: adding a category without these nouns fails the build.
 */
export const CATEGORY_NOUNS: Record<
  Category,
  { singularNew: string; pluralNew: string; singularNoun: string; pluralNoun: string }
> = {
  edilizia: {
    singularNew: 'nuova pratica',
    pluralNew: 'nuove pratiche',
    singularNoun: 'pratica',
    pluralNoun: 'pratiche',
  },
  cantieri: {
    singularNew: 'nuovo cantiere',
    pluralNew: 'nuovi cantieri',
    singularNoun: 'cantiere',
    pluralNoun: 'cantieri',
  },
  commercio: {
    singularNew: 'nuova attività',
    pluralNew: 'nuove attività',
    singularNoun: 'attività',
    pluralNoun: 'attività',
  },
  eventi: {
    singularNew: 'nuovo evento',
    pluralNew: 'nuovi eventi',
    singularNoun: 'evento',
    pluralNoun: 'eventi',
  },
  segnalazioni: {
    singularNew: 'nuova segnalazione',
    pluralNew: 'nuove segnalazioni',
    singularNoun: 'segnalazione',
    pluralNoun: 'segnalazioni',
  },
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
 * Whether a category's `source_updated_at → date_issued` span is a genuine
 * permit **processing time** (request → release), so its released rows may feed
 * the sync-screen "Tempi di rilascio" aggregate + the permit-detail "…della
 * norma" comparison (`processing-stats.ts`).
 *
 * - edilizia + commercio are istanza→esito filings: the span is exactly the time
 *   a resident waits for a pratica to be released. TRUE.
 * - cantieri stores `effectivestartdate → effectiveenddate` — a physical
 *   **works duration** (often 1+ year), unrelated to any release time, yet its
 *   concluded rows normalize to `'concluso'` which is a RELEASED_STATUS. Left in
 *   the pool they inflate the observed range (min/max) and skew the "norma" pool
 *   on an edilizia detail. FALSE — excluded.
 * - eventi/segnalazioni carry no released status, so they never reach the pool;
 *   FALSE for completeness.
 *
 * Exhaustive `Record<Category, boolean>`: a sixth category cannot ship without
 * declaring whether its dates are a release time (rather than silently leaking a
 * non-processing span into the aggregate).
 */
export const CATEGORY_HAS_RELEASE_TIME: Record<Category, boolean> = {
  edilizia: true,
  commercio: true,
  cantieri: false,
  eventi: false,
  segnalazioni: false,
};

/** The categories whose released rows feed the processing-time aggregate. */
export const RELEASE_TIME_CATEGORIES: Category[] = (
  Object.keys(CATEGORY_HAS_RELEASE_TIME) as Category[]
).filter((c) => CATEGORY_HAS_RELEASE_TIME[c]);

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
 * String-indexable view of {@link SOURCES}. `SOURCES` is inferred as a narrow
 * literal (for autocompletion on the known keys), so indexing it by a plain
 * `string` — e.g. a stored `permits.dataset` value — is a type error. This
 * widening assignment (no `as`) exposes the same object as a lookup keyed by any
 * string, returning `undefined` for an unknown dataset key.
 */
const SOURCE_BY_KEY: Record<string, SourceConfig> = SOURCES;

/**
 * Human dataset label for a stored `permits.dataset` key (e.g. `'eventi'` →
 * "Eventi culturali", `'pdc'` → "Permesso di Costruire"). Falls back to the raw
 * key for an unrecognized dataset rather than throwing.
 */
export function datasetLabelFor(datasetKey: string): string {
  return SOURCE_BY_KEY[datasetKey]?.label ?? datasetKey;
}

/**
 * Compile-time guarantee that every edilizia `DatasetKey` has a `SOURCES` entry.
 * Because `SOURCES` is typed `Record<string, SourceConfig>` (to admit non-edilizia
 * keys), this assignment is what keeps the edilizia registry in lock-step with
 * `DATASETS`: drop a dataset key from `SOURCES` and this line stops compiling.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ediliziaCovered: Record<DatasetKey, SourceConfig> = SOURCES;
