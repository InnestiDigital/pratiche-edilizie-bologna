import { describe, it, expect } from 'vitest';
import { farmaciaRowSchema, parseFarmaciePage } from './source-farmacie';
import { STATIC_LAYERS } from './static-layers';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    farmacia: 'COMUNALE BATTINDARNO',
    civkey: '058000028000',
    indirizzo: 'VIA BATTINDARNO, 28',
    area_stati: 'aperta',
    zona_pross: 'Santa Viola',
    geo_point_2d: { lon: 11.3, lat: 44.5 },
    geo_shape: { type: 'Point' },
    ...overrides,
  };
}

describe('farmaciaRowSchema', () => {
  it('shapes a real-shaped row into a farmacie StaticMarker', () => {
    expect(farmaciaRowSchema.parse(rawRow())).toEqual({
      id: '058000028000',
      lat: 44.5,
      lon: 11.3,
      layer: 'farmacie',
      title: 'COMUNALE BATTINDARNO',
      subtitle: 'VIA BATTINDARNO, 28',
      color: STATIC_LAYERS.farmacie.color,
    });
  });

  it('prefers indirizzo, falls back to zona_pross, then null for the subtitle', () => {
    // indirizzo present → indirizzo wins.
    expect(farmaciaRowSchema.parse(rawRow()).subtitle).toBe('VIA BATTINDARNO, 28');
    // indirizzo blank → zona_pross fallback (ODS empty string folds to null first).
    expect(farmaciaRowSchema.parse(rawRow({ indirizzo: '' })).subtitle).toBe('Santa Viola');
    expect(farmaciaRowSchema.parse(rawRow({ indirizzo: null })).subtitle).toBe('Santa Viola');
    // both blank → null.
    expect(farmaciaRowSchema.parse(rawRow({ indirizzo: '', zona_pross: '' })).subtitle).toBeNull();
    expect(
      farmaciaRowSchema.parse(rawRow({ indirizzo: undefined, zona_pross: undefined })).subtitle
    ).toBeNull();
  });

  it('rejects a row missing the required name or id', () => {
    expect(farmaciaRowSchema.safeParse(rawRow({ civkey: undefined })).success).toBe(false);
    expect(farmaciaRowSchema.safeParse(rawRow({ farmacia: undefined })).success).toBe(false);
  });

  it('rejects a row with no / junk / out-of-range coordinates', () => {
    expect(farmaciaRowSchema.safeParse(rawRow({ geo_point_2d: undefined })).success).toBe(false);
    expect(farmaciaRowSchema.safeParse(rawRow({ geo_point_2d: { lat: 44.5 } })).success).toBe(
      false
    );
    expect(
      farmaciaRowSchema.safeParse(rawRow({ geo_point_2d: { lon: 'x', lat: 'y' } })).success
    ).toBe(false);
    expect(
      farmaciaRowSchema.safeParse(rawRow({ geo_point_2d: { lon: 11.3, lat: 999 } })).success
    ).toBe(false);
  });
});

describe('parseFarmaciePage', () => {
  it('parses a page and skips the unusable rows without failing the page', () => {
    const page = parseFarmaciePage({
      total_count: 3,
      results: [
        rawRow(),
        rawRow({ civkey: '058000029000', geo_point_2d: { lon: 11.31, lat: 44.51 } }),
        { farmacia: 'SENZA COORDINATE' /* no civkey, no geo → junk */ },
      ],
    });
    expect(page.results).toHaveLength(2);
    expect(page.skipped).toBe(1);
    expect(page.results[0].id).toBe('058000028000');
    expect(page.results[1].id).toBe('058000029000');
  });

  it('throws SyncIngressError when a page has rows but none survive (shape drift)', () => {
    expect(() => parseFarmaciePage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page (end of data)', () => {
    expect(parseFarmaciePage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});
