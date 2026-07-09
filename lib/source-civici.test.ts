import { describe, it, expect } from 'vitest';
import { civiciRowSchema, parseCiviciPage } from './source-civici';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    codvia: 4230,
    civico: 12,
    geo_point_2d: { lat: 44.4949, lon: 11.3426 },
    indirizzo_completo: 'VIA UGO BASSI 12',
    quartiere: 'Porto - Saragozza',
    ...overrides,
  };
}

describe('civiciRowSchema', () => {
  it('flattens a well-formed gazetteer row into a CiviciRecord', () => {
    const r = civiciRowSchema.parse(rawRow());
    expect(r).toEqual({ codvia: 4230, civico: 12, lat: 44.4949, lon: 11.3426 });
  });

  it('coerces the ODS numeric-string civico to a number', () => {
    expect(civiciRowSchema.parse(rawRow({ civico: '34' })).civico).toBe(34);
  });

  it('rejects a letter-suffixed civico that cannot join a numeric edilizia civico', () => {
    expect(civiciRowSchema.safeParse(rawRow({ civico: '12/A' })).success).toBe(false);
    expect(civiciRowSchema.safeParse(rawRow({ civico: '5B' })).success).toBe(false);
  });

  it('rejects a row missing any join key or the coordinate', () => {
    expect(civiciRowSchema.safeParse(rawRow({ codvia: undefined })).success).toBe(false);
    expect(civiciRowSchema.safeParse(rawRow({ civico: null })).success).toBe(false);
    expect(civiciRowSchema.safeParse(rawRow({ geo_point_2d: undefined })).success).toBe(false);
    expect(civiciRowSchema.safeParse(rawRow({ geo_point_2d: { lat: 44.5 } })).success).toBe(false);
  });

  it('strips the unconsumed gazetteer fields from the flattened record', () => {
    expect(Object.keys(civiciRowSchema.parse(rawRow())).sort()).toEqual([
      'civico',
      'codvia',
      'lat',
      'lon',
    ]);
  });
});

describe('parseCiviciPage', () => {
  it('parses a page and skips the unusable rows without failing the page', () => {
    const page = parseCiviciPage({
      total_count: 3,
      results: [rawRow(), rawRow({ codvia: 4231, civico: '9' }), { civico: '12/A' /* junk */ }],
    });
    expect(page.results).toHaveLength(2);
    expect(page.skipped).toBe(1);
    expect(page.results[0]).toEqual({ codvia: 4230, civico: 12, lat: 44.4949, lon: 11.3426 });
    expect(page.results[1].codvia).toBe(4231);
  });

  it('throws SyncIngressError when a page has rows but none survive (shape drift)', () => {
    expect(() => parseCiviciPage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page (end of data)', () => {
    expect(parseCiviciPage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});
