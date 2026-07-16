import { describe, it, expect } from 'vitest';
import { scuolaRowSchema, parseScuolePage } from './source-scuole';
import { STATIC_LAYERS } from './static-layers';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    geo_id: '381',
    civkey: '192000003000',
    nome: 'CARDUCCI STATALE',
    denominazi: 'VIA DANTE',
    civico: '3',
    servizio: "SCUOLA DELL'INFANZIA",
    quartiere: 'Santo Stefano',
    geo_point_2d: { lon: 11.35462760636298, lat: 44.48691483151359 },
    geo_shape: { type: 'Feature' },
    ...overrides,
  };
}

describe('scuolaRowSchema', () => {
  it('shapes a real-shaped row into a scuole StaticMarker keyed on geo_id', () => {
    expect(scuolaRowSchema.parse(rawRow())).toEqual({
      id: '381',
      lat: 44.48691483151359,
      lon: 11.35462760636298,
      layer: 'scuole',
      title: 'CARDUCCI STATALE',
      subtitle: 'VIA DANTE 3',
      color: STATIC_LAYERS.scuole.color,
    });
  });

  it('keys on geo_id, not civkey (a civic-address key that dup schools share)', () => {
    // Two schools at one address share civkey but have distinct geo_id — the marker
    // must key on geo_id so a multi-plesso address does not collapse to one pin.
    const a = scuolaRowSchema.parse(rawRow({ geo_id: '381', civkey: '192000003000' }));
    const b = scuolaRowSchema.parse(rawRow({ geo_id: '382', civkey: '192000003000' }));
    expect(a.id).toBe('381');
    expect(b.id).toBe('382');
    expect(a.id).not.toBe(b.id);
  });

  it('builds the subtitle: street+civico, then street, then servizio, then null', () => {
    // street + civico → "VIA DANTE 3".
    expect(scuolaRowSchema.parse(rawRow()).subtitle).toBe('VIA DANTE 3');
    // street present, civico blank → street only (no trailing space).
    expect(scuolaRowSchema.parse(rawRow({ civico: '' })).subtitle).toBe('VIA DANTE');
    expect(scuolaRowSchema.parse(rawRow({ civico: null })).subtitle).toBe('VIA DANTE');
    // street blank → servizio fallback.
    expect(scuolaRowSchema.parse(rawRow({ denominazi: '' })).subtitle).toBe("SCUOLA DELL'INFANZIA");
    expect(scuolaRowSchema.parse(rawRow({ denominazi: null })).subtitle).toBe(
      "SCUOLA DELL'INFANZIA"
    );
    // street and servizio both blank → null.
    expect(scuolaRowSchema.parse(rawRow({ denominazi: '', servizio: '' })).subtitle).toBeNull();
    expect(
      scuolaRowSchema.parse(rawRow({ denominazi: undefined, servizio: undefined })).subtitle
    ).toBeNull();
  });

  it('rejects a row missing the required id or name', () => {
    expect(scuolaRowSchema.safeParse(rawRow({ geo_id: undefined })).success).toBe(false);
    expect(scuolaRowSchema.safeParse(rawRow({ nome: undefined })).success).toBe(false);
  });

  it('rejects a row with no / NaN / junk / out-of-range coordinates', () => {
    expect(scuolaRowSchema.safeParse(rawRow({ geo_point_2d: undefined })).success).toBe(false);
    // NaN lat (z.number admits NaN — the finite refine is what catches it).
    expect(
      scuolaRowSchema.safeParse(rawRow({ geo_point_2d: { lon: 11.3, lat: NaN } })).success
    ).toBe(false);
    expect(scuolaRowSchema.safeParse(rawRow({ geo_point_2d: { lat: 44.5 } })).success).toBe(false);
    expect(
      scuolaRowSchema.safeParse(rawRow({ geo_point_2d: { lon: 'x', lat: 'y' } })).success
    ).toBe(false);
    // out-of-range lat.
    expect(
      scuolaRowSchema.safeParse(rawRow({ geo_point_2d: { lon: 11.3, lat: 999 } })).success
    ).toBe(false);
  });
});

describe('parseScuolePage', () => {
  it('parses a page and skips the unusable rows without failing the page', () => {
    const page = parseScuolePage({
      total_count: 3,
      results: [
        rawRow(),
        rawRow({ geo_id: '77', geo_point_2d: { lon: 11.339, lat: 44.488 } }),
        { nome: 'SENZA COORDINATE' /* no geo_id, no geo → junk */ },
      ],
    });
    expect(page.results).toHaveLength(2);
    expect(page.skipped).toBe(1);
    expect(page.results[0].id).toBe('381');
    expect(page.results[1].id).toBe('77');
  });

  it('throws SyncIngressError when a page has rows but none survive (shape drift)', () => {
    expect(() => parseScuolePage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page (end of data)', () => {
    expect(parseScuolePage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});
