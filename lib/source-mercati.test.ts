import { describe, it, expect } from 'vitest';
import { mercatoRowSchema, parseMercatoPage } from './source-mercati';
import { STATIC_LAYERS } from './static-layers';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    recordid: 'fcc9f18377905af15e8ac960145983c6ece14811',
    denominazione: 'VIA V.VENETO C/O MERCATO RIONALE',
    tipologia: 'mercato',
    ubicazione: 'via Veneto',
    giorni_svolgimento: 'Martedì, Venerdì',
    geopoint: { lon: 11.3199839173378, lat: 44.4985504408057 },
    ...overrides,
  };
}

describe('mercatoRowSchema', () => {
  it('shapes a real-shaped row into a mercati StaticMarker keyed on recordid', () => {
    expect(mercatoRowSchema.parse(rawRow())).toEqual({
      id: 'fcc9f18377905af15e8ac960145983c6ece14811',
      lat: 44.4985504408057,
      lon: 11.3199839173378,
      layer: 'mercati',
      title: 'VIA V.VENETO C/O MERCATO RIONALE',
      subtitle: 'Martedì, Venerdì',
      color: STATIC_LAYERS.mercati.color,
    });
  });

  it('keys on recordid, not denominazione (which repeats across market rows)', () => {
    // Two distinct market rows can share the same denominazione; the marker must key
    // on the unique ODS recordid so the two do not collapse to one pin (React key).
    const a = mercatoRowSchema.parse(rawRow({ recordid: 'aaa', denominazione: 'MERCATO X' }));
    const b = mercatoRowSchema.parse(rawRow({ recordid: 'bbb', denominazione: 'MERCATO X' }));
    expect(a.id).toBe('aaa');
    expect(b.id).toBe('bbb');
    expect(a.id).not.toBe(b.id);
  });

  it('builds the subtitle: market days, then location, then null', () => {
    // giorni_svolgimento present → the market days.
    expect(mercatoRowSchema.parse(rawRow()).subtitle).toBe('Martedì, Venerdì');
    // days blank → ubicazione fallback.
    expect(mercatoRowSchema.parse(rawRow({ giorni_svolgimento: '' })).subtitle).toBe('via Veneto');
    expect(mercatoRowSchema.parse(rawRow({ giorni_svolgimento: null })).subtitle).toBe(
      'via Veneto'
    );
    // days and location both blank → null.
    expect(
      mercatoRowSchema.parse(rawRow({ giorni_svolgimento: '', ubicazione: '' })).subtitle
    ).toBeNull();
    expect(
      mercatoRowSchema.parse(rawRow({ giorni_svolgimento: undefined, ubicazione: undefined }))
        .subtitle
    ).toBeNull();
  });

  it('rejects a row missing the required id or name', () => {
    expect(mercatoRowSchema.safeParse(rawRow({ recordid: undefined })).success).toBe(false);
    expect(mercatoRowSchema.safeParse(rawRow({ denominazione: undefined })).success).toBe(false);
  });

  it('rejects a row with no / NaN / junk / out-of-range coordinates', () => {
    expect(mercatoRowSchema.safeParse(rawRow({ geopoint: undefined })).success).toBe(false);
    // NaN lat (z.number admits NaN — the finite refine is what catches it).
    expect(mercatoRowSchema.safeParse(rawRow({ geopoint: { lon: 11.3, lat: NaN } })).success).toBe(
      false
    );
    expect(mercatoRowSchema.safeParse(rawRow({ geopoint: { lat: 44.5 } })).success).toBe(false);
    expect(mercatoRowSchema.safeParse(rawRow({ geopoint: { lon: 'x', lat: 'y' } })).success).toBe(
      false
    );
    // out-of-range lon.
    expect(mercatoRowSchema.safeParse(rawRow({ geopoint: { lon: 999, lat: 44.5 } })).success).toBe(
      false
    );
  });
});

describe('parseMercatoPage', () => {
  it('parses a page and skips the unusable rows without failing the page', () => {
    const page = parseMercatoPage({
      total_count: 3,
      results: [
        rawRow(),
        rawRow({ recordid: 'zzz', geopoint: { lon: 11.339, lat: 44.501 } }),
        { denominazione: 'SENZA COORDINATE' /* no recordid, no geo → junk */ },
      ],
    });
    expect(page.results).toHaveLength(2);
    expect(page.skipped).toBe(1);
    expect(page.results[0].id).toBe('fcc9f18377905af15e8ac960145983c6ece14811');
    expect(page.results[1].id).toBe('zzz');
  });

  it('throws SyncIngressError when a page has rows but none survive (shape drift)', () => {
    expect(() => parseMercatoPage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page (end of data)', () => {
    expect(parseMercatoPage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});
