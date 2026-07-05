import { describe, it, expect } from 'vitest';
import {
  segnalazioneRowSchema,
  parseSegnalazioniPage,
  normalizeSegnalazione,
  type SegnalazioneRow,
} from './source-segnalazioni';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    ticketid: 109780,
    quartiere: 'San Donato - San Vitale',
    data_inserimento: '2018-10-19T12:20:35+00:00',
    sottocategoria_01: 'Viabilità e traffico',
    sottocategoria_02: 'Non definita',
    sottocategoria_03: 'Non definita',
    nome_zona_prossimita: 'CROCE DEL BIACCO - ROVERI',
    categoria_segnalazione: 'Segnalazioni',
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}): SegnalazioneRow {
  return segnalazioneRowSchema.parse(rawRow(overrides));
}

describe('segnalazioneRowSchema', () => {
  it('accepts a well-formed row and normalizes absent fields to null', () => {
    const r = segnalazioneRowSchema.parse({ ticketid: 1 });
    expect(r.ticketid).toBe('1');
    expect(r.quartiere).toBeNull();
    expect(r.data_inserimento).toBeNull();
    expect(r.sottocategoria_01).toBeNull();
    expect(r.nome_zona_prossimita).toBeNull();
  });

  it('coerces a numeric ticketid to a string and accepts a string ticketid', () => {
    expect(parse({ ticketid: 109780 }).ticketid).toBe('109780');
    expect(parse({ ticketid: '109780' }).ticketid).toBe('109780');
  });

  it('rejects a row without a ticketid', () => {
    expect(segnalazioneRowSchema.safeParse({ quartiere: 'Navile' }).success).toBe(false);
  });

  it('preserves unknown passthrough fields (geopoint, lat/lon, …)', () => {
    const r = segnalazioneRowSchema.parse(
      rawRow({ geopoint: { lat: 44.4, lon: 11.3 }, latitude: '44.4' })
    ) as Record<string, unknown>;
    expect(r.geopoint).toEqual({ lat: 44.4, lon: 11.3 });
    expect(r.latitude).toBe('44.4');
  });
});

describe('parseSegnalazioniPage', () => {
  it('parses a page and skips rows without a ticketid', () => {
    const page = parseSegnalazioniPage({
      total_count: 2,
      results: [rawRow(), { quartiere: 'orphan, no ticketid' }],
    });
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(1);
    expect(page.results[0].ticketid).toBe('109780');
  });

  it('throws SyncIngressError when a page has rows but none survive', () => {
    expect(() => parseSegnalazioniPage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page', () => {
    expect(parseSegnalazioniPage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});

describe('normalizeSegnalazione', () => {
  it('maps every field to the normalized permit shape', () => {
    const n = normalizeSegnalazione(parse());
    expect(n.dataset).toBe('segnalazioni');
    expect(n.source_id).toBe('segnalazioni-109780');
    expect(n.filing_type).toBe('SEGNALAZIONE');
    expect(n.category).toBe('segnalazioni');
    expect(n.zone).toBe('San Donato-San Vitale');
    expect(n.codvia).toBeNull();
    expect(n.procedimento).toBeNull();
    expect(n.source_updated_at).toBe('2018-10-19');
  });

  it('never carries an address (this dataset has none) and has no closing date', () => {
    expect(normalizeSegnalazione(parse()).address).toBeNull();
    expect(normalizeSegnalazione(parse({ nome_zona_prossimita: 'X' })).address).toBeNull();
    expect(normalizeSegnalazione(parse()).date_issued).toBeNull();
  });

  it('uses a constant "altro" status with empty raw (no outcome field exists)', () => {
    const n = normalizeSegnalazione(parse());
    expect(n.status).toBe('altro');
    expect(n.status_raw).toBe('');
  });

  it('builds the title from the sottocategoria chain, dropping "Non definita" fillers', () => {
    // Only level 1 real → just that level.
    expect(normalizeSegnalazione(parse()).title).toBe('Viabilità e traffico');
    // Full drill-down chain joined with ' · '.
    expect(
      normalizeSegnalazione(
        parse({
          sottocategoria_01: 'Verde privato',
          sottocategoria_02: 'Alberi/rami',
          sottocategoria_03: 'Invadenti',
        })
      ).title
    ).toBe('Verde privato · Alberi/rami · Invadenti');
    // A gap ("Non definita" in the middle) is dropped, not left as a blank segment.
    expect(
      normalizeSegnalazione(
        parse({
          sottocategoria_01: 'Arredo urbano',
          sottocategoria_02: 'Non definita',
          sottocategoria_03: 'Da spostare',
        })
      ).title
    ).toBe('Arredo urbano · Da spostare');
  });

  it('falls back to the generic "Segnalazione" title when no real subcategory survives', () => {
    expect(
      normalizeSegnalazione(
        parse({ sottocategoria_01: null, sottocategoria_02: null, sottocategoria_03: null })
      ).title
    ).toBe('Segnalazione');
    expect(
      normalizeSegnalazione(
        parse({
          sottocategoria_01: 'Non definita',
          sottocategoria_02: 'non definita',
          sottocategoria_03: '  ',
        })
      ).title
    ).toBe('Segnalazione');
  });

  it('stores only non-null extra keys (raw sottocategoria chain + nome_zona_prossimita)', () => {
    expect(JSON.parse(normalizeSegnalazione(parse()).extra)).toEqual({
      sottocategoria_01: 'Viabilità e traffico',
      sottocategoria_02: 'Non definita',
      sottocategoria_03: 'Non definita',
      nome_zona_prossimita: 'CROCE DEL BIACCO - ROVERI',
    });
    expect(
      JSON.parse(
        normalizeSegnalazione(
          parse({
            sottocategoria_02: null,
            sottocategoria_03: null,
            nome_zona_prossimita: null,
          })
        ).extra
      )
    ).toEqual({ sottocategoria_01: 'Viabilità e traffico' });
  });

  it('tags are always empty (report type lives in the title, not duplicated)', () => {
    expect(normalizeSegnalazione(parse()).tags).toBe('[]');
  });

  it('leaves an absent data_inserimento as a null primary date', () => {
    expect(normalizeSegnalazione(parse({ data_inserimento: null })).source_updated_at).toBeNull();
  });

  it('maps an unknown quartiere to null', () => {
    expect(normalizeSegnalazione(parse({ quartiere: 'Nowhere' })).zone).toBeNull();
  });

  it('links to the portal table search on the ticketid', () => {
    expect(normalizeSegnalazione(parse()).source_link).toBe(
      'https://opendata.comune.bologna.it/explore/dataset/segnalazioni-open-citizen-relationship-management-czrm/table/?q=109780'
    );
  });
});
