import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import { syncRecent, syncFull } from './sync';
import { PERMIT_CONTENT_FIELDS, type PermitContent } from './upsert-classify';
import { addYearsIso, MAX_OFFSET } from './paginate';

/**
 * `sync.ts` reaches for the SQLite singleton via `getDb()` — mock the whole
 * module so tests never touch `expo-sqlite`. `makeFakeDb()` builds a fresh
 * in-memory double per test and `useFakeDb()` swaps it in before each
 * `syncRecent`/`syncFull` call, mirroring the fake-db-double pattern in
 * `queries.test.ts`.
 */
vi.mock('./db', () => ({
  getDb: () => Promise.resolve(currentDb),
}));

let currentDb: SQLite.SQLiteDatabase;

type StoredPermit = { id: number } & PermitContent;

interface RecordedRun {
  sql: string;
  params: unknown[];
}

/**
 * The `INSERT OR IGNORE INTO permits (...)` column order in `upsertPermit` — the
 * param index of each content column, so the fake can reconstruct the full stored
 * `PermitContent` (the existing-row lookup now selects every content column, and
 * `classifyUpsert` compares all of them; a fake that stored only `status` would
 * spuriously report `updated` on a second sync).
 */
const INSERT_CONTENT_INDEX: Record<(typeof PERMIT_CONTENT_FIELDS)[number], number> = {
  source_updated_at: 4,
  address: 6,
  zone: 7,
  codvia: 8,
  procedimento: 9,
  date_issued: 10,
  status: 11,
  status_raw: 12,
  tags: 13,
  source_link: 14,
  title: 15,
  extra: 16,
};

/** Reconstruct a PermitContent from an ordered list of the 12 content values. */
function contentFromOrdered(values: unknown[]): PermitContent {
  const out: Record<string, unknown> = {};
  PERMIT_CONTENT_FIELDS.forEach((field, i) => {
    out[field] = values[i];
  });
  // Single documented cast at the fake-db boundary: `values` is the exact,
  // ordered param list `upsertPermit` bound, so `out` is structurally a
  // PermitContent (mirrors the `as unknown as SQLiteDatabase` fake below).
  return out as PermitContent;
}

/**
 * Minimal fake of the slice of expo-sqlite `upsertPermit`/`sync_log` writes use:
 * an in-memory `source_id → {id, …content}` map (driving the existing-row lookup
 * `upsertPermit` does before each insert/update) plus a log of every `runAsync`
 * call so tests can assert on `sync_log` writes and permit upserts.
 */
function makeFakeDb() {
  const permitsBySourceId = new Map<string, StoredPermit>();
  const syncLogRows: { dataset: string; new_count: number; updated_count: number }[] = [];
  const runs: RecordedRun[] = [];
  let nextId = 1;

  const db = {
    getFirstAsync: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('FROM permits WHERE source_id')) {
        const [sourceId] = params;
        return (permitsBySourceId.get(sourceId as string) ?? null) as never;
      }
      return null as never;
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      runs.push({ sql, params });

      if (sql.startsWith('INSERT OR IGNORE INTO permits')) {
        const sourceId = params[1] as string;
        if (permitsBySourceId.has(sourceId)) {
          return { changes: 0, lastInsertRowId: 0 } as never;
        }
        const id = nextId++;
        const content = contentFromOrdered(
          PERMIT_CONTENT_FIELDS.map((f) => params[INSERT_CONTENT_INDEX[f]])
        );
        permitsBySourceId.set(sourceId, { id, ...content });
        return { changes: 1, lastInsertRowId: id } as never;
      }

      if (sql.startsWith('UPDATE permits SET')) {
        // UPDATE binds the 12 content columns in PERMIT_CONTENT_FIELDS order,
        // then the id last.
        const id = params[params.length - 1] as number;
        const content = contentFromOrdered(params.slice(0, PERMIT_CONTENT_FIELDS.length));
        for (const [sourceId, row] of permitsBySourceId) {
          if (row.id === id) permitsBySourceId.set(sourceId, { id, ...content });
        }
        return { changes: 1, lastInsertRowId: 0 } as never;
      }

      if (sql.startsWith('INSERT INTO sync_log')) {
        const [dataset, , newCount, updatedCount] = params;
        syncLogRows.push({
          dataset: dataset as string,
          new_count: newCount as number,
          updated_count: updatedCount as number,
        });
        return { changes: 1, lastInsertRowId: 0 } as never;
      }

      throw new Error(`makeFakeDb: unhandled runAsync SQL: ${sql}`);
    },
  } as unknown as SQLite.SQLiteDatabase;

  return { db, permitsBySourceId, syncLogRows, runs };
}

/** Swap in a fresh fake db before a test drives `syncRecent`/`syncFull`. */
function useFakeDb() {
  const fake = makeFakeDb();
  currentDb = fake.db;
  return fake;
}

/** Build a minimal Response-like object, mirroring fetch-page.test.ts's helper. */
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** One well-formed raw row per source, matching each source-*.test.ts fixture. */
const RAW_ROWS: Record<string, Record<string, unknown>> = {
  'permessi-di-costruire-rilasciati': {
    richiesta_ndeg_prot: 1,
    richiesta_anno_prot: '2025',
    richiesta_data: '2025-03-01',
    procedimento: 'PDC ORDINARIO',
    esito_pratica: 'Rilasciata',
    chiusura_pratica_data: '2025-06-01',
    codvia: 350,
    civico: 10,
    esponenteciv: null,
    localizzazioni_lista: 'Via Indipendenza 10',
  },
  'scia-segnalazioni-certificate-di-inizio-attivita-depositate': {
    richiesta_ndeg_prot: 2,
    richiesta_anno_prot: '2025',
    richiesta_data: '2025-03-02',
    procedimento: 'SCIA ORDINARIA',
    esito_pratica: 'Depositata',
    chiusura_pratica_data: null,
    codvia: 351,
    civico: 11,
    esponenteciv: null,
    localizzazioni_lista: 'Via Rizzoli 1',
  },
  'cila-comunicazioni-inizio-lavori': {
    richiesta_ndeg_prot: 3,
    richiesta_anno_prot: '2025',
    richiesta_data: '2025-03-03',
    procedimento: 'CILA',
    esito_pratica: 'Depositata',
    chiusura_pratica_data: null,
    codvia: 352,
    civico: 12,
    esponenteciv: null,
    localizzazioni_lista: 'Via Ugo Bassi 2',
  },
  'lavori-pubblici': {
    id: 3739,
    status: 'In corso',
    address: 'VIA DELLA MANIFATTURA',
    description: 'Lavori per la realizzazione del Tecnopolo',
    trafficchangesmeasure: 'Divieto di transito veicolare',
    neighborhood1: 'Navile',
    effectivestartdate: '2021-06-10T22:00:00+00:00',
    effectiveenddate: '2028-03-30T22:00:00+00:00',
    visualizationnotes: null,
  },
  'istanze-commercio': {
    n_e_anno_prot_domanda: '416143 / 2018',
    data_richiesta: '2018-11-10',
    esito_pratica: "chiusura d'ufficio",
    data_fine_procedimento: '2018-11-29',
    tipo_intervento: 'Apertura somministrazione temporanea',
    tipo_pratica: 'SCIA a 0 giorni',
    area: 'Somministrazione',
    sottoarea: 'Somministrazione al pubblico',
    esercizio_via: 'VIALE DELLA FIERA',
    esercizio_civico: null,
    esponente1: null,
    quartiere: 'San Donato - San Vitale',
  },
  'eventi-bologna-agenda-cultura': {
    id: '467834',
    title: 'Una biblioteca in ospedale 2024-2025',
    description: 'Un progetto di lettura in corsia.',
    url: 'https://culturabologna.it/events/467834',
    address: 'L.go Bartolo Nigrisoli, 2, 40133 Bologna BO',
    categories_1: 'incontri',
    categories_2: null,
    categories_3: null,
    online: 'NO',
    start: '2024-09-27',
    end: '2025-02-13',
    date_multiple: null,
    quartiere: 'Porto - Saragozza',
    zona_di_prossimita: 'SARAGOZZA - SAN LUCA',
  },
  'segnalazioni-open-citizen-relationship-management-czrm': {
    ticketid: 109780,
    quartiere: 'San Donato - San Vitale',
    data_inserimento: '2018-10-19T12:20:35+00:00',
    sottocategoria_01: 'Viabilità e traffico',
    sottocategoria_02: 'Non definita',
    sottocategoria_03: 'Non definita',
    nome_zona_prossimita: 'CROCE DEL BIACCO - ROVERI',
    categoria_segnalazione: 'Segnalazioni',
  },
};

/** Every ODS dataset slug this app syncs — one entry per `SOURCES` key. */
const ALL_SLUGS = Object.keys(RAW_ROWS);

/**
 * Stub `fetch` so every request for a known slug returns a single short page
 * (one row, well under `API_LIMIT`) — `walkPages` stops after the first call
 * regardless of the offset/refine/where params, and a count-probe request (used
 * by the `year-refine` FULL and `date-range` sweeps) reads the same small
 * `total_count`, so it never needs to sub-split by year or month. This keeps
 * every sweep strategy (`full`, `year-refine`, `date-range`, `future-window`) to
 * a handful of requests per source regardless of mode, without asserting on the
 * exact request count (the sweep-strategy shape is covered by `paginate.test.ts`
 * / `ods-request.test.ts` — this file only cares about per-source orchestration).
 */
function stubFetch(includeSlugs: string[] = ALL_SLUGS) {
  const fn = vi.fn(async (url: string) => {
    const slug = includeSlugs.find((s) => url.includes(`/datasets/${s}/records`));
    if (!slug) throw new Error(`stubFetch: unexpected URL ${url}`);
    return jsonResponse({ total_count: 1, results: [RAW_ROWS[slug]] });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Slugs actually requested by a stubbed fetch mock, de-duplicated. */
function requestedSlugs(fn: ReturnType<typeof vi.fn>): Set<string> {
  const slugs = new Set<string>();
  for (const [url] of fn.mock.calls as [string][]) {
    const match = ALL_SLUGS.find((s) => url.includes(`/datasets/${s}/records`));
    if (match) slugs.add(match);
  }
  return slugs;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncRecent — edilizia regression (byte-identical to the pre-registry 3-dataset sync)', () => {
  it('syncs exactly pdc/scia/cila, in that order, each stamped category "edilizia"', async () => {
    stubFetch();
    const fake = useFakeDb();

    const results = await syncRecent(undefined, ['edilizia']);

    expect(results.map((r) => r.dataset)).toEqual(['pdc', 'scia', 'cila']);
    for (const r of results) {
      expect(r.category).toBe('edilizia');
      expect(r.error).toBeUndefined();
      // `recentYears(currentYear, 2)` walks 2 filing years — the stub returns
      // the same single row for each, so it is fetched twice but only
      // inserted once (the second year's row is the same `source_id`, an
      // "unchanged" outcome via `classifyUpsert`, not a re-insert).
      expect(r.fetched).toBe(2);
      expect(r.inserted).toBe(1);
      expect(r.updated).toBe(0);
    }

    // Only the three edilizia datasets were ever requested — no cantieri/
    // commercio/eventi/segnalazioni request leaked in.
    expect(fake.syncLogRows.map((r) => r.dataset)).toEqual(['pdc', 'scia', 'cila']);
    expect(fake.permitsBySourceId.size).toBe(3);
  });

  it('never fetches a non-edilizia slug when scoped to ["edilizia"]', async () => {
    const fetchMock = stubFetch();
    useFakeDb();

    await syncRecent(undefined, ['edilizia']);

    expect(requestedSlugs(fetchMock)).toEqual(
      new Set([
        'permessi-di-costruire-rilasciati',
        'scia-segnalazioni-certificate-di-inizio-attivita-depositate',
        'cila-comunicazioni-inizio-lavori',
      ])
    );
  });

  it('a second sync of the same permits reports them as unchanged (no re-insert, no update)', async () => {
    stubFetch();
    const fake = useFakeDb();

    await syncRecent(undefined, ['edilizia']);
    const second = await syncRecent(undefined, ['edilizia']);

    for (const r of second) {
      expect(r.inserted).toBe(0);
      expect(r.updated).toBe(0);
    }
    expect(fake.permitsBySourceId.size).toBe(3);
  });

  it('isolates a single source failure: the other two still sync and report their own SyncResult', async () => {
    useFakeDb();
    // 404 is a permanent failure (not retried by `withRetry`), so this stays
    // fast and deterministic — a 5xx would exercise the real backoff delays.
    const fn = vi.fn(async (url: string) => {
      if (
        url.includes(
          '/datasets/scia-segnalazioni-certificate-di-inizio-attivita-depositate/records'
        )
      ) {
        return { ok: false, status: 404, headers: new Headers(), text: async () => '' } as Response;
      }
      const slug = ALL_SLUGS.find((s) => url.includes(`/datasets/${s}/records`));
      return jsonResponse({ total_count: 1, results: [RAW_ROWS[slug!]] });
    });
    vi.stubGlobal('fetch', fn);

    const results = await syncRecent(undefined, ['edilizia']);

    const [pdc, scia, cila] = results;
    expect(pdc.error).toBeUndefined();
    expect(pdc.inserted).toBe(1);
    expect(scia.error).toBeDefined();
    expect(scia.fetched).toBe(0);
    expect(cila.error).toBeUndefined();
    expect(cila.inserted).toBe(1);
  });
});

describe('syncFull — edilizia regression', () => {
  it('syncs pdc/scia/cila via the full-scan path with the same shape as syncRecent', async () => {
    stubFetch();
    useFakeDb();

    const results = await syncFull(undefined, ['edilizia']);

    expect(results.map((r) => r.dataset)).toEqual(['pdc', 'scia', 'cila']);
    for (const r of results) {
      expect(r.category).toBe('edilizia');
      expect(r.error).toBeUndefined();
      expect(r.inserted).toBe(r.fetched);
    }
  });
});

describe('syncRecent — preferences.interests gating', () => {
  it('with no categories argument, syncs every registered source', async () => {
    const fetchMock = stubFetch();
    useFakeDb();

    const results = await syncRecent(undefined, undefined);

    expect(results.map((r) => r.dataset)).toEqual([
      'pdc',
      'scia',
      'cila',
      'lavori',
      'commercio',
      'eventi',
      'segnalazioni',
    ]);
    expect(requestedSlugs(fetchMock).size).toBe(ALL_SLUGS.length);
  });

  it('restricts the run to sources whose category is in `interests`', async () => {
    const fetchMock = stubFetch();
    useFakeDb();

    const results = await syncRecent(undefined, ['cantieri', 'eventi']);

    expect(results.map((r) => r.dataset)).toEqual(['lavori', 'eventi']);
    expect(results.map((r) => r.category)).toEqual(['cantieri', 'eventi']);
    expect(requestedSlugs(fetchMock)).toEqual(
      new Set(['lavori-pubblici', 'eventi-bologna-agenda-cultura'])
    );
  });

  it('an empty `interests` list syncs nothing (user opted out of every category)', async () => {
    const fetchMock = stubFetch();
    useFakeDb();

    const results = await syncRecent(undefined, []);

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gates commercio/segnalazioni (date-range sweep) and edilizia together by category', async () => {
    const fetchMock = stubFetch();
    useFakeDb();

    const results = await syncRecent(undefined, ['edilizia', 'commercio']);

    expect(results.map((r) => r.dataset)).toEqual(['pdc', 'scia', 'cila', 'commercio']);
    expect(requestedSlugs(fetchMock)).not.toContain(
      'segnalazioni-open-citizen-relationship-management-czrm'
    );
  });
});

const EVENTI_SLUG = 'eventi-bologna-agenda-cultura';
const SEGNALAZIONI_SLUG = 'segnalazioni-open-citizen-relationship-management-czrm';
const DAY_MS = 86_400_000;

/** Decode one stubbed request into the fields the cap tests assert on. */
function reqInfo(url: string) {
  const u = new URL(url);
  const where = u.searchParams.get('where');
  const limit = Number(u.searchParams.get('limit'));
  const from = where?.match(/>=date'([\d-]+)'/)?.[1] ?? null;
  const to = where?.match(/<date'([\d-]+)'/)?.[1] ?? null;
  return { where, limit, from, to, isProbe: limit === 1 };
}

describe('cap-overflow sweeps — no row is silently lost beyond MAX_OFFSET', () => {
  it('future-window under the cap costs exactly one count-probe then one walk', async () => {
    const calls: { limit: number; where: string | null }[] = [];
    const fn = vi.fn(async (url: string) => {
      const info = reqInfo(url);
      calls.push({ limit: info.limit, where: info.where });
      return jsonResponse({ total_count: 1, results: [RAW_ROWS[EVENTI_SLUG]] });
    });
    vi.stubGlobal('fetch', fn);
    useFakeDb();

    const results = await syncRecent(undefined, ['eventi']);
    expect(results.map((r) => r.dataset)).toEqual(['eventi']);
    expect(results[0].error).toBeUndefined();

    // Exactly two requests: the open-ended count-probe (limit 1), then the walk
    // (limit 100) — the one extra request vs. a blind walk, the price of cap safety.
    expect(calls).toHaveLength(2);
    expect(calls[0].limit).toBe(1);
    expect(calls[1].limit).toBe(100);
    // Both hit the same open-ended `since` window (no upper bound / no AND).
    for (const c of calls) {
      expect(c.where).toMatch(/^start>=date'\d{4}-\d{2}-\d{2}'$/);
    }
  });

  it('future-window over the cap peels a bounded year off the front, then recurses on the remainder', async () => {
    let openEndedProbes = 0;
    const requests: ReturnType<typeof reqInfo>[] = [];
    const fn = vi.fn(async (url: string) => {
      const info = reqInfo(url);
      requests.push(info);
      const bounded = info.where?.includes(' AND ') ?? false;
      let total = 1;
      if (info.isProbe && !bounded) {
        // First open-ended probe is over the cap (forces a peel); the probe on
        // the open-ended remainder tail is under the cap (recursion terminates).
        total = openEndedProbes === 0 ? MAX_OFFSET + 1 : 1;
        openEndedProbes++;
      }
      return jsonResponse({ total_count: total, results: [RAW_ROWS[EVENTI_SLUG]] });
    });
    vi.stubGlobal('fetch', fn);
    useFakeDb();

    const results = await syncRecent(undefined, ['eventi']);
    expect(results[0].error).toBeUndefined();

    const bounded = requests.filter((r) => r.where?.includes(' AND '));
    const openEnded = requests.filter((r) => r.where && !r.where.includes(' AND '));
    // One bounded year window was peeled off the front...
    expect(bounded.length).toBeGreaterThan(0);
    const peeled = bounded[0];
    expect(peeled.to).toBe(addYearsIso(peeled.from!, 1));
    // ...and the recursion then probed the open-ended remainder starting exactly
    // at that year boundary (peel-then-recurse), which was under the cap.
    expect(openEnded.some((r) => r.from === peeled.to)).toBe(true);
  });

  it('date-range bisects an over-cap year recursively, splitting a still-over-cap half again', async () => {
    const currentYear = new Date().getFullYear();
    const requests: ReturnType<typeof reqInfo>[] = [];
    const fn = vi.fn(async (url: string) => {
      const info = reqInfo(url);
      requests.push(info);
      let total = 1;
      if (info.isProbe && info.from && info.to) {
        const spanDays = (Date.parse(info.to) - Date.parse(info.from)) / DAY_MS;
        // Only windows inside the current year stay over the cap, and only until
        // narrowed under ~100 days — so the current full year splits into halves,
        // and each half (still >100 days) splits again into sub-100-day quarters.
        if (info.from.startsWith(`${currentYear}-`) && spanDays > 100) total = MAX_OFFSET + 1;
      }
      return jsonResponse({ total_count: total, results: [RAW_ROWS[SEGNALAZIONI_SLUG]] });
    });
    vi.stubGlobal('fetch', fn);
    useFakeDb();

    const results = await syncRecent(undefined, ['segnalazioni']);
    expect(results[0].error).toBeUndefined();
    expect(results[0].fetched).toBeGreaterThan(0);

    const walks = requests.filter((r) => r.limit === 100);

    // recentYears = [currentYear - 1, currentYear]. The previous full year stayed
    // under the cap → walked whole, exactly once, never bisected.
    const prevYearWalks = walks.filter((r) => r.from === `${currentYear - 1}-01-01`);
    expect(prevYearWalks).toHaveLength(1);
    expect(prevYearWalks[0].to).toBe(`${currentYear}-01-01`);

    // The current full year was NEVER walked whole (it was over the cap → bisected).
    expect(
      walks.some((r) => r.from === `${currentYear}-01-01` && r.to === `${currentYear + 1}-01-01`)
    ).toBe(false);

    // Every current-year walk is a narrowed sub-window (< ~100 days), and there
    // are four of them — proof of two bisection levels (year → 2 halves → 4
    // quarters), i.e. an over-cap half was itself split again.
    const cyWalks = walks.filter((r) => r.from!.startsWith(`${currentYear}-`));
    expect(cyWalks).toHaveLength(4);
    for (const w of cyWalks) {
      const spanDays = (Date.parse(w.to!) - Date.parse(w.from!)) / DAY_MS;
      expect(spanDays).toBeLessThanOrEqual(100);
    }
  });

  it('date-range bisects all the way down to a single day and walks it anyway when even a day is over cap', async () => {
    // Physically implausible for these datasets, but `bisectRange` returns null
    // once a window is down to a single day (it cannot split further) — the
    // recursion must terminate there and walk the day as-is, accepting the cap
    // truncation, rather than looping forever trying to bisect a 1-day window.
    const currentYear = new Date().getFullYear();
    const TARGET = `${currentYear}-01-01`;
    const requests: ReturnType<typeof reqInfo>[] = [];
    const fn = vi.fn(async (url: string) => {
      const info = reqInfo(url);
      requests.push(info);
      // Only the branch of the bisection that still contains TARGET is kept
      // over the cap (including the final single-day window) — the sibling
      // half at every level is reported under the cap, so recursion follows
      // one path down instead of exploding exponentially.
      const overCap =
        info.isProbe &&
        info.from !== null &&
        info.to !== null &&
        info.from <= TARGET &&
        TARGET < info.to;
      return jsonResponse({
        total_count: overCap ? MAX_OFFSET + 1 : 1,
        results: [RAW_ROWS[SEGNALAZIONI_SLUG]],
      });
    });
    vi.stubGlobal('fetch', fn);
    useFakeDb();

    const results = await syncRecent(undefined, ['segnalazioni']);

    expect(results[0].error).toBeUndefined();
    expect(results[0].fetched).toBeGreaterThan(0);

    // The single calendar day containing TARGET was eventually walked directly
    // (limit 100), even though its own probe reported a count over MAX_OFFSET —
    // proof the recursion terminated at a 1-day window instead of looping.
    const singleDayWalks = requests.filter(
      (r) =>
        r.limit === 100 &&
        r.from === TARGET &&
        r.to !== null &&
        (Date.parse(r.to) - Date.parse(TARGET)) / DAY_MS === 1
    );
    expect(singleDayWalks).toHaveLength(1);
  });
});
