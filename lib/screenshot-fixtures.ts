/**
 * Deterministic fixture data for the **web screenshot build only**.
 *
 * This module is imported exclusively by the `*.web.ts` platform shims
 * (`db.web.ts`, `queries.web.ts`, `preferences.web.ts`, `sync.web.ts`, ...),
 * which Metro resolves *only* for the web platform. The real iOS / Android app
 * and the vitest suite use the plain `*.ts` modules and never see this file.
 *
 * Purpose: let the loop (and Matteo) export the app to web and screenshot every
 * screen fully populated with representative permits — without booting a
 * simulator, without expo-sqlite-on-web (whose wasm worker does not bundle), and
 * without any network. See `.loop/screenshot.mjs` + `.loop/SCREENSHOTS.md`.
 *
 * Keep the shapes in sync with `lib/queries.ts` (`Permit`) and `lib/sync.ts`
 * (`SyncResult`) — tsc will flag drift where a screen reads a field absent here.
 */

import { tallyTags } from './tally-tags';
import type { Category } from './sources';
import { STATIC_LAYERS, type StaticMarker } from './static-layers';

export interface ScreenshotPermit {
  id: number;
  dataset: string;
  source_id: string;
  /**
   * `filing_type` is widened to `string` here (vs the edilizia-only `FilingType`
   * on `Permit`) so the non-edilizia fixture rows can carry their category token
   * ('CANTIERE', 'EVENTO', …). Only the edilizia card body reads this field.
   */
  filing_type: string;
  category: Category;
  source_updated_at: string | null;
  first_seen_at: string;
  address: string | null;
  zone: string | null;
  codvia: number | null;
  procedimento: string | null;
  date_issued: string | null;
  status: string;
  status_raw: string;
  /**
   * The "cosa è cambiato" transition columns. Optional here (vs required on
   * `Permit`) so only the demo row carries a value and every other fixture omits
   * them — `Permit` is a superset, so `PERMIT_FIXTURES as Permit[]` stays valid and
   * the read side treats an omitted (`undefined`) value exactly like the DB's NULL.
   */
  previous_status?: string | null;
  status_changed_at?: string | null;
  tags: string;
  source_link: string | null;
  is_new: number;
  title: string | null;
  extra: string;
}

const portal = (id: string) =>
  `https://opendata.comune.bologna.it/explore/dataset/pratiche/record/${id}`;

/**
 * A spread across all five categories, all three filing types, the six quartieri,
 * several statuses, new/seen state, and tag combinations — enough that the feed,
 * filters, and detail screens all render something realistic for every category.
 */
export const PERMIT_FIXTURES: ScreenshotPermit[] = [
  {
    id: 1,
    dataset: 'pdc',
    source_id: 'PDC-2024-000481',
    filing_type: 'PDC',
    category: 'edilizia',
    source_updated_at: '2024-11-18',
    first_seen_at: '2025-01-04T09:12:00.000Z',
    address: 'Via Marconi 24',
    zone: 'Porto-Saragozza',
    codvia: 4120,
    procedimento: 'Ristrutturazione edilizia con cambio di destinazione d’uso',
    date_issued: '2025-01-27',
    status: 'rilasciata',
    status_raw: 'Rilasciata',
    tags: JSON.stringify(['con_lavori']),
    source_link: portal('pdc-2024-000481'),
    is_new: 1,
    title: null,
    // On device `backfillEdiliziaCoords` geocodes edilizia rows by codvia+civico
    // and writes extra.lat/lon (string form, like coordsToExtra); the fixtures
    // carry plausible Via-matched coords so the map screenshot shows the edilizia
    // layer — the densest — instead of an empty flagship category.
    extra: JSON.stringify({ lat: '44.4975', lon: '11.3410' }),
  },
  {
    id: 2,
    dataset: 'scia',
    source_id: 'SCIA-2024-002210',
    filing_type: 'SCIA',
    category: 'edilizia',
    source_updated_at: '2024-11-08',
    first_seen_at: '2025-01-04T09:12:00.000Z',
    address: 'Via Zamboni 33',
    zone: 'San Donato-San Vitale',
    codvia: 8890,
    procedimento: 'Manutenzione straordinaria facciata',
    date_issued: null,
    status: 'in_attesa',
    status_raw: 'In istruttoria',
    tags: JSON.stringify(['con_lavori', 'parziale']),
    source_link: portal('scia-2024-002210'),
    is_new: 1,
    title: null,
    extra: JSON.stringify({ lat: '44.4965', lon: '11.3530' }),
  },
  {
    id: 3,
    dataset: 'cila',
    source_id: 'CILA-2024-005567',
    filing_type: 'CILA',
    category: 'edilizia',
    source_updated_at: '2024-11-02',
    first_seen_at: '2024-12-20T09:12:00.000Z',
    address: 'Via Saragozza 118',
    zone: 'Porto-Saragozza',
    codvia: 4400,
    procedimento: 'Opere interne senza aumento di superficie',
    date_issued: '2024-11-25',
    status: 'concluso',
    status_raw: 'Conclusa',
    tags: JSON.stringify([]),
    source_link: portal('cila-2024-005567'),
    is_new: 0,
    title: null,
    extra: JSON.stringify({ lat: '44.4890', lon: '11.3255' }),
  },
  {
    id: 4,
    dataset: 'pdc',
    source_id: 'PDC-2024-000390',
    filing_type: 'PDC',
    category: 'edilizia',
    source_updated_at: '2024-08-14',
    first_seen_at: '2024-12-20T09:12:00.000Z',
    address: 'Via Emilia Ponente 210',
    zone: 'Borgo Panigale-Reno',
    codvia: 1550,
    procedimento: 'Nuova costruzione edificio residenziale',
    date_issued: '2024-11-20',
    status: 'rilasciata_con_prescrizioni',
    status_raw: 'Rilasciata con prescrizioni',
    tags: JSON.stringify(['deroga']),
    source_link: portal('pdc-2024-000390'),
    is_new: 0,
    title: null,
    extra: JSON.stringify({ lat: '44.4995', lon: '11.2960' }),
  },
  {
    id: 5,
    dataset: 'scia',
    source_id: 'SCIA-2024-001988',
    filing_type: 'SCIA',
    category: 'edilizia',
    source_updated_at: '2024-07-02',
    first_seen_at: '2024-12-20T09:12:00.000Z',
    address: 'Via Toscana 55',
    zone: 'Savena',
    codvia: 7010,
    procedimento: 'Sanatoria opere edilizie',
    date_issued: null,
    status: 'archiviata',
    status_raw: 'Archiviata',
    tags: JSON.stringify(['sanatoria']),
    source_link: portal('scia-2024-001988'),
    is_new: 0,
    title: null,
    extra: JSON.stringify({ lat: '44.4720', lon: '11.3640' }),
  },
  {
    id: 6,
    dataset: 'cila',
    source_id: 'CILA-2024-004120',
    filing_type: 'CILA',
    category: 'edilizia',
    source_updated_at: '2024-06-19',
    first_seen_at: '2024-12-01T09:12:00.000Z',
    address: 'Via Irnerio 12',
    zone: 'Santo Stefano',
    codvia: 3300,
    procedimento: 'Efficientamento energetico e serramenti',
    date_issued: '2024-08-05',
    status: 'concluso',
    status_raw: 'Conclusa',
    // "Cosa è cambiato" demo row: a permit the resident already followed whose
    // status MOVED (In attesa → Conclusa). is_new is 0, so the card shows the
    // amber "cambiata" line WITHOUT a NUOVO badge — proving the two signals are
    // distinct (NUOVO = just arrived; cambiata = moved while followed).
    previous_status: 'in_attesa',
    status_changed_at: '2024-08-05T09:00:00.000Z',
    tags: JSON.stringify(['con_lavori']),
    source_link: portal('cila-2024-004120'),
    is_new: 0,
    title: null,
    extra: JSON.stringify({ lat: '44.4985', lon: '11.3520' }),
  },
  {
    id: 7,
    dataset: 'pdc',
    source_id: 'PDC-2023-000902',
    filing_type: 'PDC',
    category: 'edilizia',
    source_updated_at: '2023-12-11',
    first_seen_at: '2024-12-01T09:12:00.000Z',
    address: 'Via del Lavoro 8',
    zone: 'Navile',
    codvia: 2100,
    procedimento: 'Ampliamento capannone non residenziale',
    date_issued: null,
    status: 'diniegata',
    status_raw: 'Diniegata',
    tags: JSON.stringify(['non_residenziale']),
    source_link: portal('pdc-2023-000902'),
    is_new: 0,
    title: null,
    extra: JSON.stringify({ lat: '44.5170', lon: '11.3620' }),
  },
  {
    id: 8,
    dataset: 'scia',
    source_id: 'SCIA-2023-003011',
    filing_type: 'SCIA',
    category: 'edilizia',
    source_updated_at: '2023-10-05',
    first_seen_at: '2024-11-15T09:12:00.000Z',
    address: 'Via Andrea Costa 140',
    zone: 'Porto-Saragozza',
    codvia: 4600,
    procedimento: 'Frazionamento unità immobiliare',
    date_issued: '2023-12-18',
    status: 'concluso',
    status_raw: 'Conclusa',
    tags: JSON.stringify(['urbanistica']),
    source_link: portal('scia-2023-003011'),
    is_new: 0,
    title: null,
    extra: JSON.stringify({ lat: '44.4915', lon: '11.3130' }),
  },
  // ── Non-edilizia categories ───────────────────────────────────────────────
  {
    id: 9,
    dataset: 'lavori',
    source_id: 'lavori-3739',
    filing_type: 'CANTIERE',
    category: 'cantieri',
    source_updated_at: '2025-02-03',
    first_seen_at: '2025-02-04T09:12:00.000Z',
    address: 'Via Stalingrado 45',
    zone: 'Navile',
    codvia: null,
    procedimento: null,
    date_issued: '2025-08-30',
    status: 'in_corso',
    status_raw: 'In corso',
    tags: '[]',
    source_link: 'https://opendata.comune.bologna.it/explore/dataset/lavori-pubblici/table/?q=3739',
    is_new: 1,
    title: 'Lavori per la realizzazione del Tecnopolo',
    // Coordinates stored as strings, mirroring the real `coordsToExtra` write —
    // the anchor of the Navile cluster that renders the detail "Nei dintorni" card.
    extra: JSON.stringify({
      trafficchangesmeasure: 'Divieto di transito veicolare',
      lat: '44.5236',
      lon: '11.361',
    }),
  },
  {
    id: 10,
    dataset: 'commercio',
    source_id: 'commercio-2024-416143',
    filing_type: 'COMMERCIO',
    category: 'commercio',
    source_updated_at: '2024-10-12',
    first_seen_at: '2025-01-04T09:12:00.000Z',
    address: 'Viale della Fiera 20',
    zone: 'San Donato-San Vitale',
    codvia: null,
    procedimento: null,
    date_issued: '2024-12-01',
    status: 'rilasciata',
    status_raw: 'Efficace',
    tags: '[]',
    source_link:
      'https://opendata.comune.bologna.it/explore/dataset/istanze-commercio/table/?q=416143',
    is_new: 0,
    title: 'Apertura somministrazione temporanea',
    extra: JSON.stringify({
      area: 'Somministrazione',
      sottoarea: 'Bar/Ristorazione',
      tipo_pratica: 'SCIA',
      lat: '44.5075',
      lon: '11.3665',
    }),
  },
  {
    id: 11,
    dataset: 'eventi',
    source_id: 'eventi-467834',
    filing_type: 'EVENTO',
    category: 'eventi',
    // Events carry no request date: source_updated_at is NULL and the future start
    // date lives in `extra.start` (see source-eventi.ts). Mirrors the real shape so
    // the EventiBody card renders its start/end date row in the web screenshot.
    source_updated_at: null,
    first_seen_at: '2025-03-01T09:12:00.000Z',
    address: 'Piazza Maggiore 6',
    zone: 'Santo Stefano',
    codvia: null,
    procedimento: null,
    date_issued: '2025-03-22',
    status: 'in_programma',
    status_raw: '',
    tags: JSON.stringify(['incontri', 'mostre']),
    source_link: 'https://culturabologna.it/eventi/467834',
    is_new: 1,
    title: 'Una biblioteca in ospedale 2024-2025',
    extra: JSON.stringify({
      description: 'Rassegna di incontri e letture negli spazi ospedalieri.',
      url: 'https://culturabologna.it/eventi/467834',
      online: 'SI',
      start: '2025-03-15',
      lat: '44.4938',
      lon: '11.3426',
    }),
  },
  {
    id: 12,
    dataset: 'segnalazioni',
    source_id: 'segnalazioni-109780',
    filing_type: 'SEGNALAZIONE',
    category: 'segnalazioni',
    source_updated_at: '2025-01-20',
    first_seen_at: '2025-01-21T09:12:00.000Z',
    address: null,
    zone: 'Savena',
    codvia: null,
    procedimento: null,
    date_issued: null,
    status: 'altro',
    status_raw: '',
    tags: '[]',
    source_link:
      'https://opendata.comune.bologna.it/explore/dataset/segnalazioni-open-citizen-relationship-management-czrm/table/?q=109780',
    is_new: 0,
    title: 'Verde privato · Alberi/rami · Invadenti',
    extra: JSON.stringify({
      sottocategoria_01: 'Verde privato',
      sottocategoria_02: 'Alberi/rami',
      sottocategoria_03: 'Invadenti',
      nome_zona_prossimita: 'Cirenaica',
      lat: '44.472',
      lon: '11.369',
    }),
  },
  // Two geo-dotted neighbours clustered around the Via Stalingrado cantiere (id 9),
  // so its detail "Nei dintorni" card lists real cross-category rows within ~500 m
  // (id 13 ~120 m, id 14 ~305 m). This is the proximity payoff the quartiere-coarse
  // "Nella stessa zona" and exact-street "Altre pratiche in <via>" cards both miss.
  {
    id: 13,
    dataset: 'lavori',
    source_id: 'lavori-3902',
    filing_type: 'CANTIERE',
    category: 'cantieri',
    source_updated_at: '2025-02-18',
    first_seen_at: '2025-02-19T09:12:00.000Z',
    address: 'Via di Corticella 10',
    zone: 'Navile',
    codvia: null,
    procedimento: null,
    date_issued: '2025-07-15',
    status: 'in_corso',
    status_raw: 'In corso',
    tags: '[]',
    source_link: 'https://opendata.comune.bologna.it/explore/dataset/lavori-pubblici/table/?q=3902',
    is_new: 0,
    title: 'Rifacimento sottoservizi e manto stradale',
    extra: JSON.stringify({
      trafficchangesmeasure: 'Senso unico alternato',
      lat: '44.5245',
      lon: '11.3618',
    }),
  },
  {
    id: 14,
    dataset: 'commercio',
    source_id: 'commercio-2025-418902',
    filing_type: 'COMMERCIO',
    category: 'commercio',
    source_updated_at: '2025-01-28',
    first_seen_at: '2025-01-29T09:12:00.000Z',
    address: 'Via Ferrarese 20',
    zone: 'Navile',
    codvia: null,
    procedimento: null,
    date_issued: '2025-02-10',
    status: 'rilasciata',
    status_raw: 'Efficace',
    tags: '[]',
    source_link:
      'https://opendata.comune.bologna.it/explore/dataset/istanze-commercio/table/?q=418902',
    is_new: 0,
    title: 'Apertura esercizio di vicinato',
    extra: JSON.stringify({
      area: 'Commercio',
      sottoarea: 'Alimentari',
      tipo_pratica: 'SCIA',
      lat: '44.5215',
      lon: '11.3585',
    }),
  },
];

/**
 * A handful of realistic Bologna farmacie for the map screenshot's STATIC LAYER
 * (docs/ROADMAP.md §4b). Placed on plausible central-Bologna coordinates that sit
 * within the permit-pin cloud above, so the farmacie overlay renders ON the fixture
 * map when the layer is toggled on. Imported ONLY by `static-layer-sync.web.ts` (the
 * web shim), never by a `.ts` module. Color is sourced from the registry so it never
 * drifts from the live layer hue.
 */
export const STATIC_MARKER_FIXTURES: StaticMarker[] = [
  {
    id: '058000010000',
    lat: 44.4949,
    lon: 11.3406,
    layer: 'farmacie',
    title: 'FARMACIA CENTRALE',
    subtitle: 'VIA UGO BASSI, 1',
    color: STATIC_LAYERS.farmacie.color,
  },
  {
    id: '058000021000',
    lat: 44.4972,
    lon: 11.3418,
    layer: 'farmacie',
    title: 'FARMACIA DELLA MONTAGNOLA',
    subtitle: 'VIA IRNERIO, 2',
    color: STATIC_LAYERS.farmacie.color,
  },
  {
    id: '058000028000',
    lat: 44.4901,
    lon: 11.3268,
    layer: 'farmacie',
    title: 'FARMACIA COMUNALE SARAGOZZA',
    subtitle: 'VIA SARAGOZZA, 105',
    color: STATIC_LAYERS.farmacie.color,
  },
  {
    id: '058000034000',
    lat: 44.5142,
    lon: 11.3421,
    layer: 'farmacie',
    title: 'FARMACIA COMUNALE ZANARDI',
    subtitle: 'VIA ZANARDI, 78',
    color: STATIC_LAYERS.farmacie.color,
  },
  {
    id: '058000041000',
    lat: 44.5061,
    lon: 11.3612,
    layer: 'farmacie',
    title: 'FARMACIA SAN DONATO',
    subtitle: 'VIA SAN DONATO, 44',
    color: STATIC_LAYERS.farmacie.color,
  },
  {
    id: '058000047000',
    lat: 44.4726,
    lon: 11.3641,
    layer: 'farmacie',
    title: 'FARMACIA TOSCANA',
    subtitle: 'VIA TOSCANA, 61',
    color: STATIC_LAYERS.farmacie.color,
  },
  {
    id: '058000053000',
    lat: 44.4966,
    lon: 11.3532,
    layer: 'farmacie',
    title: 'FARMACIA ZAMBONI',
    subtitle: 'VIA ZAMBONI, 59',
    color: STATIC_LAYERS.farmacie.color,
  },
];

export const STATS_FIXTURE = {
  total: PERMIT_FIXTURES.length,
  byDataset: {
    pdc: 3,
    scia: 3,
    cila: 2,
    lavori: 2,
    commercio: 2,
    eventi: 1,
    segnalazioni: 1,
  } as Record<string, number>,
  byZone: {
    'Porto-Saragozza': 3,
    'San Donato-San Vitale': 2,
    'Borgo Panigale-Reno': 1,
    Savena: 2,
    'Santo Stefano': 2,
    Navile: 4,
  } as Record<string, number>,
  byStatus: {
    concluso: 3,
    rilasciata: 3,
    rilasciata_con_prescrizioni: 1,
    archiviata: 1,
    diniegata: 1,
    in_attesa: 1,
    in_corso: 2,
    in_programma: 1,
    altro: 1,
  } as Record<string, number>,
  // Permits bucketed by request month (`source_updated_at` → `YYYY-MM`),
  // derived from the fixtures so it never drifts from the rows above — mirrors
  // the native `getStats` GROUP BY that feeds `buildMonthlyActivity`.
  byMonth: PERMIT_FIXTURES.reduce<Record<string, number>>((acc, p) => {
    if (p.source_updated_at && p.source_updated_at.length >= 7) {
      const m = p.source_updated_at.slice(0, 7);
      acc[m] = (acc[m] ?? 0) + 1;
    }
    return acc;
  }, {}),
  // Per-tag stored-permit counts, derived from the fixture rows via the same
  // pure `tallyTags` the native GROUP BY mirrors — never drifts from the rows.
  byTag: tallyTags(PERMIT_FIXTURES),
  newCount: PERMIT_FIXTURES.filter((p) => p.is_new === 1).length,
};

/**
 * Last-sync timestamp for the Sync-screen demo — computed **2 days before load**
 * (not a fixed date) so the screen renders the reassuring `fresh` freshness tier
 * (green "aggiornato 2 giorni fa"). The Sync screen reads freshness against the
 * *real* clock (`new Date()`), so a hard-coded past date would perpetually read
 * "1 anno fa" in amber `stale` — hiding the tiered-freshness tone the app ships
 * and making the App Store marketing screenshots (same fixtures via `shoot.mjs`)
 * look neglected. `new Date()` is fine here: web-only module, browser runtime.
 */
export const LAST_SYNC_FIXTURE = (() => {
  const d = new Date(Date.now() - 2 * 86_400_000);
  d.setHours(9, 12, 0, 0);
  return d.toISOString();
})();

/**
 * `source_id`s of the permits shown as **saved** in the screenshot build (see
 * `favorites.web.ts`). Two are marked so the feed renders bookmarked cards and
 * the detail screen (`/permit/1`) shows the "Salvata" state. Keyed by
 * `source_id` to mirror the real `favorites` table.
 */
export const FAVORITE_SOURCE_IDS = new Set<string>(['PDC-2024-000481', 'PDC-2024-000390']);

/**
 * Personal notes shown in the screenshot build (see `notes.web.ts`), keyed by
 * `source_id` to mirror the real `permit_notes` table. The detail screenshot
 * route is `/permit/1` (`PDC-2024-000481`), so a note on that permit renders the
 * populated "Le mie note" card.
 */
export const NOTE_FIXTURES: Record<string, { note: string; updatedAt: string }> = {
  'PDC-2024-000481': {
    note: 'Ho chiamato lo Sportello Edilizia: la pratica è in attesa del parere della Soprintendenza. Richiamare dopo il 15.',
    updatedAt: '2024-11-18T09:30:00.000Z',
  },
};
