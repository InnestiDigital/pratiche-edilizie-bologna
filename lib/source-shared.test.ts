import { describe, it, expect } from 'vitest';
import {
  compactExtra,
  coordsToExtra,
  geoPointSchema,
  nullIfEmpty,
  portalTableSearchLink,
  toIsoDate,
} from './source-shared';
import { SOURCES } from './sources';

describe('nullIfEmpty', () => {
  it('maps empty string to null', () => {
    expect(nullIfEmpty('')).toBeNull();
  });

  it('maps null / undefined to null', () => {
    expect(nullIfEmpty(null)).toBeNull();
    expect(nullIfEmpty(undefined)).toBeNull();
  });

  it('passes a real string through unchanged', () => {
    expect(nullIfEmpty('https://x')).toBe('https://x');
    expect(nullIfEmpty(' ')).toBe(' ');
  });
});

describe('compactExtra', () => {
  it('drops null, undefined and empty-string values', () => {
    expect(compactExtra({ a: 'x', b: null, c: undefined, d: '' })).toBe(JSON.stringify({ a: 'x' }));
  });

  it('serializes an all-absent object to "{}"', () => {
    expect(compactExtra({ a: null, b: undefined, c: '' })).toBe('{}');
  });

  it('preserves the caller insertion order (deterministic for change detection)', () => {
    expect(compactExtra({ z: '1', a: '2', m: '3' })).toBe('{"z":"1","a":"2","m":"3"}');
  });

  it('produces a valid JSON string', () => {
    expect(JSON.parse(compactExtra({ a: 'x', b: '' }))).toEqual({ a: 'x' });
  });
});

describe('portalTableSearchLink', () => {
  it('reads the slug from SOURCES[key] and encodes the query', () => {
    expect(portalTableSearchLink('lavori', '3739')).toBe(
      `https://opendata.comune.bologna.it/explore/dataset/${SOURCES.lavori.slug}/table/?q=3739`
    );
    expect(portalTableSearchLink('commercio', '416143')).toBe(
      `https://opendata.comune.bologna.it/explore/dataset/${SOURCES.commercio.slug}/table/?q=416143`
    );
  });

  it('percent-encodes reserved characters in the query', () => {
    expect(portalTableSearchLink('eventi', 'a b/c')).toBe(
      `https://opendata.comune.bologna.it/explore/dataset/${SOURCES.eventi.slug}/table/?q=a%20b%2Fc`
    );
  });
});

describe('toIsoDate', () => {
  it('slices a datetime to YYYY-MM-DD', () => {
    expect(toIsoDate('2024-09-27T20:00:00+00:00')).toBe('2024-09-27');
  });

  it('passes a plain date through', () => {
    expect(toIsoDate('2024-09-27')).toBe('2024-09-27');
  });

  it('maps null / undefined / empty string to null', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate('')).toBeNull();
  });
});

describe('geoPointSchema', () => {
  it('accepts a { lon, lat } number pair and strips unknown keys', () => {
    expect(geoPointSchema.parse({ lon: 11.34, lat: 44.49, source: 'ods' })).toEqual({
      lon: 11.34,
      lat: 44.49,
    });
  });

  it('rejects a missing or non-numeric coordinate', () => {
    expect(geoPointSchema.safeParse({ lat: 44.49 }).success).toBe(false);
    expect(geoPointSchema.safeParse({ lat: '44.49', lon: '11.34' }).success).toBe(false);
    expect(geoPointSchema.safeParse(null).success).toBe(false);
  });
});

describe('coordsToExtra', () => {
  it('stringifies a valid geo-point for storage', () => {
    expect(coordsToExtra({ lat: 44.4949, lon: 11.3426 })).toEqual({
      lat: '44.4949',
      lon: '11.3426',
    });
  });

  it('maps null / undefined to null fields (dropped by compactExtra)', () => {
    expect(coordsToExtra(null)).toEqual({ lat: null, lon: null });
    expect(coordsToExtra(undefined)).toEqual({ lat: null, lon: null });
  });

  it('rejects NaN (z.number admits it) and out-of-range coordinates', () => {
    expect(coordsToExtra({ lat: NaN, lon: 11.3 })).toEqual({ lat: null, lon: null });
    expect(coordsToExtra({ lat: 44.5, lon: Infinity })).toEqual({ lat: null, lon: null });
    expect(coordsToExtra({ lat: 91, lon: 11.3 })).toEqual({ lat: null, lon: null });
    expect(coordsToExtra({ lat: 44.5, lon: 181 })).toEqual({ lat: null, lon: null });
  });

  it('keeps a coordinate at the exact WGS84 bounds', () => {
    expect(coordsToExtra({ lat: -90, lon: 180 })).toEqual({ lat: '-90', lon: '180' });
  });

  it('round-trips through compactExtra as string values', () => {
    const c = coordsToExtra({ lat: 44.5, lon: 11.3 });
    expect(JSON.parse(compactExtra({ lat: c.lat, lon: c.lon }))).toEqual({
      lat: '44.5',
      lon: '11.3',
    });
    // A null point leaves no lat/lon keys at all.
    const none = coordsToExtra(null);
    expect(JSON.parse(compactExtra({ lat: none.lat, lon: none.lon }))).toEqual({});
  });
});
