import { describe, it, expect } from 'vitest';
import { toMapPins, pinsRegion, BOLOGNA_CENTER } from './map-pins';
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
    const { pins, withoutCoords } = toMapPins([
      withCoords(1, '44.50', '11.34'),
      permit({ id: 2, extra: '{}' }), // no coords
      withCoords(3, '44.51', '11.35', 'commercio'),
      permit({ id: 4, extra: JSON.stringify({ lat: '', lon: '11.3' }) }), // blank → dropped
    ]);
    expect(pins.map((p) => p.id)).toEqual([1, 3]);
    expect(withoutCoords).toBe(2);
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
