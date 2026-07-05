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

export interface ScreenshotPermit {
  id: number;
  dataset: string;
  source_id: string;
  filing_type: 'PDC' | 'SCIA' | 'CILA';
  source_updated_at: string | null;
  first_seen_at: string;
  address: string | null;
  zone: string | null;
  codvia: number | null;
  procedimento: string | null;
  date_issued: string | null;
  status: string;
  status_raw: string;
  tags: string;
  source_link: string | null;
  is_new: number;
}

const portal = (id: string) =>
  `https://opendata.comune.bologna.it/explore/dataset/pratiche/record/${id}`;

/**
 * A spread across all three filing types, the six quartieri, several statuses,
 * new/seen state, and tag combinations — enough that the feed, filters, and
 * detail screens all render something realistic.
 */
export const PERMIT_FIXTURES: ScreenshotPermit[] = [
  {
    id: 1,
    dataset: 'pdc',
    source_id: 'PDC-2024-000481',
    filing_type: 'PDC',
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
  },
  {
    id: 2,
    dataset: 'scia',
    source_id: 'SCIA-2024-002210',
    filing_type: 'SCIA',
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
  },
  {
    id: 3,
    dataset: 'cila',
    source_id: 'CILA-2024-005567',
    filing_type: 'CILA',
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
  },
  {
    id: 4,
    dataset: 'pdc',
    source_id: 'PDC-2024-000390',
    filing_type: 'PDC',
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
  },
  {
    id: 5,
    dataset: 'scia',
    source_id: 'SCIA-2024-001988',
    filing_type: 'SCIA',
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
  },
  {
    id: 6,
    dataset: 'cila',
    source_id: 'CILA-2024-004120',
    filing_type: 'CILA',
    source_updated_at: '2024-06-19',
    first_seen_at: '2024-12-01T09:12:00.000Z',
    address: 'Via Irnerio 12',
    zone: 'Santo Stefano',
    codvia: 3300,
    procedimento: 'Efficientamento energetico e serramenti',
    date_issued: '2024-08-05',
    status: 'concluso',
    status_raw: 'Conclusa',
    tags: JSON.stringify(['con_lavori']),
    source_link: portal('cila-2024-004120'),
    is_new: 0,
  },
  {
    id: 7,
    dataset: 'pdc',
    source_id: 'PDC-2023-000902',
    filing_type: 'PDC',
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
  },
  {
    id: 8,
    dataset: 'scia',
    source_id: 'SCIA-2023-003011',
    filing_type: 'SCIA',
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
  },
];

export const STATS_FIXTURE = {
  total: PERMIT_FIXTURES.length,
  byDataset: { pdc: 3, scia: 3, cila: 2 } as Record<string, number>,
  byZone: {
    'Porto-Saragozza': 3,
    'San Donato-San Vitale': 1,
    'Borgo Panigale-Reno': 1,
    Savena: 1,
    'Santo Stefano': 1,
    Navile: 1,
  } as Record<string, number>,
  byStatus: {
    concluso: 3,
    rilasciata: 1,
    rilasciata_con_prescrizioni: 1,
    archiviata: 1,
    diniegata: 1,
    in_attesa: 1,
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

export const LAST_SYNC_FIXTURE = '2025-01-04T09:12:00.000Z';

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
