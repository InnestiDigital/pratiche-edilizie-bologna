import { describe, it, expect } from 'vitest';
import {
  commercioRowSchema,
  parseCommercioPage,
  normalizeCommercio,
  type CommercioRow,
} from './source-commercio';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}): CommercioRow {
  return commercioRowSchema.parse(rawRow(overrides));
}

describe('commercioRowSchema', () => {
  it('accepts a well-formed row and normalizes absent fields to null', () => {
    const r = commercioRowSchema.parse({ n_e_anno_prot_domanda: '1 / 2020' });
    expect(r.n_e_anno_prot_domanda).toBe('1 / 2020');
    expect(r.data_richiesta).toBeNull();
    expect(r.esito_pratica).toBeNull();
    expect(r.tipo_intervento).toBeNull();
    expect(r.esercizio_civico).toBeNull();
    expect(r.quartiere).toBeNull();
  });

  it('rejects a row without the required protocol string', () => {
    expect(commercioRowSchema.safeParse({ tipo_intervento: 'Apertura' }).success).toBe(false);
    // An empty protocol string cannot address a record — rejected too.
    expect(commercioRowSchema.safeParse({ n_e_anno_prot_domanda: '' }).success).toBe(false);
  });

  it('accepts a numeric esercizio_civico', () => {
    expect(parse({ esercizio_civico: 83 }).esercizio_civico).toBe(83);
  });

  it('preserves unknown passthrough fields', () => {
    const r = commercioRowSchema.parse(rawRow({ zona: 'X' })) as Record<string, unknown>;
    expect(r.zona).toBe('X');
  });
});

describe('parseCommercioPage', () => {
  it('parses a page and skips rows without a protocol string', () => {
    const page = parseCommercioPage({
      total_count: 2,
      results: [rawRow(), { tipo_intervento: 'Apertura' /* no protocol */ }],
    });
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(1);
    expect(page.results[0].n_e_anno_prot_domanda).toBe('416143 / 2018');
  });

  it('throws SyncIngressError when a page has rows but none survive', () => {
    expect(() => parseCommercioPage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page', () => {
    expect(parseCommercioPage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});

describe('normalizeCommercio', () => {
  it('maps every field to the normalized permit shape', () => {
    const n = normalizeCommercio(parse());
    expect(n.dataset).toBe('commercio');
    expect(n.source_id).toBe('commercio-2018-416143');
    expect(n.filing_type).toBe('COMMERCIO');
    expect(n.category).toBe('commercio');
    expect(n.title).toBe('Apertura somministrazione temporanea');
    expect(n.zone).toBe('San Donato-San Vitale');
    expect(n.codvia).toBeNull();
    expect(n.procedimento).toBeNull();
    expect(n.tags).toBe('[]');
    expect(n.source_updated_at).toBe('2018-11-10');
    expect(n.date_issued).toBe('2018-11-29');
  });

  it('builds source_id "commercio-<anno>-<prot>" from the pre-combined protocol', () => {
    expect(normalizeCommercio(parse({ n_e_anno_prot_domanda: '416143 / 2018' })).source_id).toBe(
      'commercio-2018-416143'
    );
    // Tolerant of missing spaces around the slash.
    expect(normalizeCommercio(parse({ n_e_anno_prot_domanda: '12/2020' })).source_id).toBe(
      'commercio-2020-12'
    );
  });

  it('falls back to a whitespace-stripped id for a malformed protocol', () => {
    // No slash → not two parts → fallback, still stable and unique.
    expect(normalizeCommercio(parse({ n_e_anno_prot_domanda: '999888' })).source_id).toBe(
      'commercio-999888'
    );
    // Three parts → fallback keeps the raw (whitespace-stripped) form.
    expect(normalizeCommercio(parse({ n_e_anno_prot_domanda: 'a / b / c' })).source_id).toBe(
      'commercio-a/b/c'
    );
  });

  it('targets the protocol number in the portal source link', () => {
    expect(normalizeCommercio(parse()).source_link).toBe(
      'https://opendata.comune.bologna.it/explore/dataset/istanze-commercio/table/?q=416143'
    );
  });

  it('joins the address from via/civico/esponente, dropping absent parts', () => {
    expect(normalizeCommercio(parse()).address).toBe('VIALE DELLA FIERA');
    expect(
      normalizeCommercio(
        parse({ esercizio_civico: 58, esponente1: 'A', esercizio_via: 'VIA DEL PRATELLO' })
      ).address
    ).toBe('VIA DEL PRATELLO 58 A');
    expect(
      normalizeCommercio(parse({ esercizio_via: null, esercizio_civico: null, esponente1: null }))
        .address
    ).toBeNull();
  });

  it('reuses the shared edilizia normalizeStatus for esito_pratica', () => {
    expect(normalizeCommercio(parse({ esito_pratica: 'Efficace' })).status).toBe('rilasciata');
    expect(normalizeCommercio(parse({ esito_pratica: "chiusura d'ufficio" })).status).toBe('altro');
    expect(normalizeCommercio(parse({ esito_pratica: null })).status).toBe('altro');
    expect(normalizeCommercio(parse({ esito_pratica: 'Efficace' })).status_raw).toBe('Efficace');
    expect(normalizeCommercio(parse({ esito_pratica: null })).status_raw).toBe('');
  });

  it('stores only non-null extra keys (area/sottoarea/tipo_pratica) as a JSON object', () => {
    expect(JSON.parse(normalizeCommercio(parse()).extra)).toEqual({
      area: 'Somministrazione',
      sottoarea: 'Somministrazione al pubblico',
      tipo_pratica: 'SCIA a 0 giorni',
    });
    expect(
      JSON.parse(
        normalizeCommercio(parse({ area: null, sottoarea: null, tipo_pratica: null })).extra
      )
    ).toEqual({});
  });

  it('extracts the geopoint into extra.lat/lon as strings, omitted when absent', () => {
    const withGeo = JSON.parse(
      normalizeCommercio(parse({ geopoint: { lon: 11.3709, lat: 44.5219 } })).extra
    );
    expect(withGeo.lat).toBe('44.5219');
    expect(withGeo.lon).toBe('11.3709');
    expect(JSON.parse(normalizeCommercio(parse()).extra).lat).toBeUndefined();
  });

  it('leaves dates null when absent and maps an unknown quartiere to null', () => {
    const n = normalizeCommercio(
      parse({ data_richiesta: null, data_fine_procedimento: null, quartiere: 'Nowhere' })
    );
    expect(n.source_updated_at).toBeNull();
    expect(n.date_issued).toBeNull();
    expect(n.zone).toBeNull();
  });

  it('normalizes a full ODS datetime to plain YYYY-MM-DD like the other sources', () => {
    const n = normalizeCommercio(
      parse({
        data_richiesta: '2018-11-10T10:30:00+00:00',
        data_fine_procedimento: '2018-11-29T23:59:59+00:00',
      })
    );
    expect(n.source_updated_at).toBe('2018-11-10');
    expect(n.date_issued).toBe('2018-11-29');
  });
});
