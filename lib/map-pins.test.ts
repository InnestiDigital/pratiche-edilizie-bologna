import { describe, it, expect } from 'vitest';
import {
  toMapPins,
  pinsRegion,
  mapViewport,
  describeWithoutCoords,
  metersToLatDelta,
  metersToLonDelta,
  homeCircleFraction,
  BOLOGNA_CENTER,
  type HomeMarker,
} from './map-pins';
import type { Permit } from './queries';
import type { Category } from './sources';
import { CATEGORY_COLORS } from './sources';

function permit(over: Partial<Permit> & { id: number }): Permit {
  return {
    dataset: 'edilizia',
    source_id: `src-${over.id}`,
    filing_type: 'PDC',
    category: 'edilizia',
    source_updated_at: '2024-01-01',
    first_seen_at: '2024-01-02T00:00:00.000Z',
    address: null,
    zone: null,
    codvia: null,
    procedimento: null,
    date_issued: null,
    status: 'presentata',
    status_raw: '',
    tags: '[]',
    source_link: null,
    is_new: 0,
    title: null,
    extra: '{}',
    ...over,
  };
}

const withCoords = (
  id: number,
  lat: string,
  lon: string,
  cat: Category = 'cantieri',
  rest: Partial<Permit> = {}
): Permit => permit({ id, category: cat, extra: JSON.stringify({ lat, lon }), ...rest });

describe('toMapPins', () => {
  it('keeps rows with valid coords and counts the coordinate-less ones', () => {
    const { pins, withoutCoords, withoutByCategory } = toMapPins([
      withCoords(1, '44.50', '11.34'),
      permit({ id: 2, extra: '{}' }), // no coords (default category = edilizia)
      withCoords(3, '44.51', '11.35', 'commercio'),
      permit({ id: 4, category: 'cantieri', extra: JSON.stringify({ lat: '', lon: '11.3' }) }), // blank → dropped
    ]);
    expect(pins.map((p) => p.id)).toEqual([1, 3]);
    expect(withoutCoords).toBe(2);
    // the two dropped rows are broken down by their category
    expect(withoutByCategory).toEqual({ edilizia: 1, cantieri: 1 });
  });

  it('preserves input order', () => {
    const { pins } = toMapPins([
      withCoords(3, '44.53', '11.33'),
      withCoords(1, '44.51', '11.31'),
      withCoords(2, '44.52', '11.32'),
    ]);
    expect(pins.map((p) => p.id)).toEqual([3, 1, 2]);
  });

  it('colors a pin with its category text color', () => {
    const { pins } = toMapPins([withCoords(1, '44.5', '11.3', 'eventi')]);
    expect(pins[0].color).toBe(CATEGORY_COLORS.eventi.text);
  });

  it('uses address as title for edilizia and title otherwise', () => {
    const { pins } = toMapPins([
      withCoords(1, '44.5', '11.3', 'edilizia', { address: 'Via Rizzoli 1', procedimento: 'PDC' }),
      withCoords(2, '44.5', '11.3', 'commercio', {
        title: 'Nuovo bar',
        address: 'Via Indipendenza 2',
      }),
    ]);
    expect(pins[0].title).toBe('Via Rizzoli 1');
    expect(pins[0].subtitle).toBe('PDC'); // edilizia subtitle = procedimento
    expect(pins[1].title).toBe('Nuovo bar');
    expect(pins[1].subtitle).toBe('Via Indipendenza 2'); // non-edilizia subtitle = address
  });

  it('falls back to a placeholder title when every headline field is empty', () => {
    const { pins } = toMapPins([withCoords(1, '44.5', '11.3', 'segnalazioni')]);
    expect(pins[0].title).toBe('Voce senza titolo');
    expect(pins[0].subtitle).toBeNull();
  });
});

describe('describeWithoutCoords', () => {
  it('returns null when nothing is missing', () => {
    expect(describeWithoutCoords({})).toBeNull();
    expect(describeWithoutCoords({ edilizia: 0 })).toBeNull();
  });

  it('names the single missing category with a plural noun', () => {
    expect(describeWithoutCoords({ edilizia: 8 })).toBe('8 pratiche senza posizione');
    expect(describeWithoutCoords({ cantieri: 3 })).toBe('3 cantieri senza posizione');
  });

  it('uses the singular noun when exactly one row of one category is missing', () => {
    expect(describeWithoutCoords({ edilizia: 1 })).toBe('1 pratica senza posizione');
    expect(describeWithoutCoords({ commercio: 1 })).toBe('1 attività senza posizione');
  });

  it('falls back to a generic "voci" count when the missing rows are mixed', () => {
    expect(describeWithoutCoords({ edilizia: 6, cantieri: 2 })).toBe('8 voci senza posizione');
  });
});

describe('pinsRegion', () => {
  it('returns the Bologna center when there are no pins', () => {
    expect(pinsRegion([])).toEqual(BOLOGNA_CENTER);
  });

  it('centers on the bounding-box midpoint of the pins', () => {
    const { pins } = toMapPins([withCoords(1, '44.40', '11.20'), withCoords(2, '44.60', '11.40')]);
    const region = pinsRegion(pins);
    expect(region.latitude).toBeCloseTo(44.5, 6);
    expect(region.longitude).toBeCloseTo(11.3, 6);
  });

  it('pads the span and never returns NaN', () => {
    const { pins } = toMapPins([withCoords(1, '44.40', '11.20'), withCoords(2, '44.60', '11.40')]);
    const region = pinsRegion(pins);
    // span 0.2 * (1 + 0.25 padding) = 0.25
    expect(region.latitudeDelta).toBeCloseTo(0.25, 6);
    expect(region.longitudeDelta).toBeCloseTo(0.25, 6);
    expect(Number.isNaN(region.latitudeDelta)).toBe(false);
  });

  it('floors the span at the minimum delta for a single pin', () => {
    const { pins } = toMapPins([withCoords(1, '44.5', '11.3')]);
    const region = pinsRegion(pins);
    expect(region.latitude).toBeCloseTo(44.5, 6);
    expect(region.latitudeDelta).toBe(0.01);
    expect(region.longitudeDelta).toBe(0.01);
  });
});

const home = (over: Partial<HomeMarker> = {}): HomeMarker => ({
  lat: 44.5,
  lon: 11.3,
  radiusMeters: 500,
  label: 'Via Test 1',
  ...over,
});

describe('metersToLatDelta / metersToLonDelta', () => {
  it('converts a latitude distance to degrees (≈111.32 km per degree)', () => {
    expect(metersToLatDelta(111_320)).toBeCloseTo(1, 6);
    expect(metersToLatDelta(0)).toBe(0);
  });

  it('widens the longitude span toward the poles (cos scaling)', () => {
    // At 60°N cos = 0.5, so a metre buys twice the longitude degrees as at the equator.
    expect(metersToLonDelta(111_320, 60)).toBeCloseTo(2, 4);
    expect(metersToLonDelta(111_320, 0)).toBeCloseTo(1, 6);
  });

  it('never blows up at the pole (cos → 0 guarded)', () => {
    const d = metersToLonDelta(1000, 90);
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe('mapViewport', () => {
  it('falls back to the Bologna center when there are no pins and no home', () => {
    expect(mapViewport([], null)).toEqual(BOLOGNA_CENTER);
  });

  it('matches pinsRegion when there is no home', () => {
    const { pins } = toMapPins([withCoords(1, '44.40', '11.20'), withCoords(2, '44.60', '11.40')]);
    expect(mapViewport(pins, null)).toEqual(pinsRegion(pins));
  });

  it('frames the home circle when a home is set but no pins exist', () => {
    const region = mapViewport([], home({ lat: 44.5, lon: 11.3, radiusMeters: 500 }));
    expect(region.latitude).toBeCloseTo(44.5, 6);
    expect(region.longitude).toBeCloseTo(11.3, 6);
    // Circle diameter in latitude ≈ 2*500/111320 ≈ 0.00898°, *1.25 padding ≈ 0.01122°.
    expect(region.latitudeDelta).toBeCloseTo(0.01122, 4);
    expect(Number.isNaN(region.longitudeDelta)).toBe(false);
  });

  it('expands the viewport to include a home that sits outside the pin cloud', () => {
    const { pins } = toMapPins([withCoords(1, '44.50', '11.30')]);
    const far = home({ lat: 44.6, lon: 11.4, radiusMeters: 500 });
    const region = mapViewport(pins, far);
    // Center shifts toward the home, and the span now covers both points (≫ MIN_DELTA).
    expect(region.latitude).toBeGreaterThan(44.5);
    expect(region.latitude).toBeLessThan(44.6);
    expect(region.latitudeDelta).toBeGreaterThan(0.05);
  });
});

describe('homeCircleFraction', () => {
  it('reports the circle size as a fraction of the region span', () => {
    const region = { latitude: 44.5, longitude: 11.3, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    const { widthFrac, heightFrac } = homeCircleFraction(home({ radiusMeters: 500 }), region);
    // heightFrac = 2*500/111320 / 0.1 ≈ 0.0898
    expect(heightFrac).toBeCloseTo(0.0898, 3);
    // longitude buys more degrees at latitude, so the ring is wider than it is tall.
    expect(widthFrac).toBeGreaterThan(heightFrac);
    expect(Number.isNaN(widthFrac)).toBe(false);
  });
});
