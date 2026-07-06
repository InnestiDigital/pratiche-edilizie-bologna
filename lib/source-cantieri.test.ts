import { describe, it, expect } from 'vitest';
import {
  cantiereRowSchema,
  parseCantieriPage,
  normalizeCantiere,
  type CantiereRow,
} from './source-cantieri';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 3739,
    status: 'In corso',
    address: 'VIA DELLA MANIFATTURA',
    description: 'Lavori per la realizzazione del Tecnopolo',
    trafficchangesmeasure: 'Divieto di transito veicolare',
    neighborhood1: 'Navile',
    effectivestartdate: '2021-06-10T22:00:00+00:00',
    effectiveenddate: '2028-03-30T22:00:00+00:00',
    visualizationnotes: null,
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}): CantiereRow {
  return cantiereRowSchema.parse(rawRow(overrides));
}

describe('cantiereRowSchema', () => {
  it('accepts a well-formed row and normalizes absent fields to null', () => {
    const r = cantiereRowSchema.parse({ id: 1 });
    expect(r.id).toBe(1);
    expect(r.status).toBeNull();
    expect(r.address).toBeNull();
    expect(r.description).toBeNull();
    expect(r.trafficchangesmeasure).toBeNull();
    expect(r.neighborhood1).toBeNull();
  });

  it('rejects a row without the required numeric id', () => {
    expect(cantiereRowSchema.safeParse({ status: 'In corso' }).success).toBe(false);
    expect(cantiereRowSchema.safeParse({ id: '3739' }).success).toBe(false);
  });

  it('preserves unknown passthrough fields', () => {
    const r = cantiereRowSchema.parse(rawRow({ roadway1: 'X' })) as Record<string, unknown>;
    expect(r.roadway1).toBe('X');
  });
});

describe('parseCantieriPage', () => {
  it('parses a page and skips id-less rows', () => {
    const page = parseCantieriPage({
      total_count: 2,
      results: [rawRow(), { status: 'In corso' /* no id */ }],
    });
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(1);
    expect(page.results[0].id).toBe(3739);
  });

  it('throws SyncIngressError when a page has rows but none survive', () => {
    expect(() => parseCantieriPage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page', () => {
    expect(parseCantieriPage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});

describe('normalizeCantiere', () => {
  it('maps every field to the normalized permit shape', () => {
    const n = normalizeCantiere(parse());
    expect(n.dataset).toBe('lavori');
    expect(n.source_id).toBe('lavori-3739');
    expect(n.filing_type).toBe('CANTIERE');
    expect(n.category).toBe('cantieri');
    expect(n.title).toBe('Lavori per la realizzazione del Tecnopolo');
    expect(n.address).toBe('VIA DELLA MANIFATTURA');
    expect(n.zone).toBe('Navile');
    expect(n.codvia).toBeNull();
    expect(n.procedimento).toBeNull();
    expect(n.tags).toBe('[]');
    expect(n.source_link).toBe(
      'https://opendata.comune.bologna.it/explore/dataset/lavori-pubblici/table/?q=3739'
    );
  });

  it('slices datetimes to plain YYYY-MM-DD for both dates', () => {
    const n = normalizeCantiere(parse());
    expect(n.source_updated_at).toBe('2021-06-10');
    expect(n.date_issued).toBe('2028-03-30');
  });

  it('leaves dates null when absent', () => {
    const n = normalizeCantiere(parse({ effectivestartdate: null, effectiveenddate: null }));
    expect(n.source_updated_at).toBeNull();
    expect(n.date_issued).toBeNull();
  });

  it('maps status to the cantieri-local vocabulary and keeps status_raw', () => {
    expect(normalizeCantiere(parse({ status: 'In corso' })).status).toBe('in_corso');
    expect(normalizeCantiere(parse({ status: 'Concluso' })).status).toBe('concluso');
    expect(normalizeCantiere(parse({ status: 'Lavori terminati' })).status).toBe('concluso');
    expect(normalizeCantiere(parse({ status: 'Programmato' })).status).toBe('altro');
    expect(normalizeCantiere(parse({ status: null })).status).toBe('altro');
    expect(normalizeCantiere(parse({ status: 'In corso' })).status_raw).toBe('In corso');
    expect(normalizeCantiere(parse({ status: null })).status_raw).toBe('');
  });

  it('stores only non-null extra keys as a JSON object', () => {
    expect(JSON.parse(normalizeCantiere(parse()).extra)).toEqual({
      trafficchangesmeasure: 'Divieto di transito veicolare',
    });
    expect(JSON.parse(normalizeCantiere(parse({ trafficchangesmeasure: null })).extra)).toEqual({});
  });

  it('extracts the pinpoint geo-point into extra.lat/lon as strings', () => {
    expect(
      JSON.parse(normalizeCantiere(parse({ pinpoint: { lon: 11.3612, lat: 44.5222 } })).extra)
    ).toEqual({
      trafficchangesmeasure: 'Divieto di transito veicolare',
      lat: '44.5222',
      lon: '11.3612',
    });
  });

  it('stores no coordinate when the pinpoint is absent or out of range', () => {
    expect(JSON.parse(normalizeCantiere(parse()).extra).lat).toBeUndefined();
    expect(
      JSON.parse(normalizeCantiere(parse({ pinpoint: { lon: 999, lat: 44.5 } })).extra).lon
    ).toBeUndefined();
  });

  it('maps the spaced-hyphen neighborhood to the canonical quartiere', () => {
    expect(normalizeCantiere(parse({ neighborhood1: 'San Donato - San Vitale' })).zone).toBe(
      'San Donato-San Vitale'
    );
    expect(normalizeCantiere(parse({ neighborhood1: null })).zone).toBeNull();
  });
});
