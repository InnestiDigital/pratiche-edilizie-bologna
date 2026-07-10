import { describe, it, expect } from 'vitest';
import type { Coords } from './permit-extra';
import {
  serializeHome,
  parseStoredHome,
  sanitizeHomeRadius,
  formatRadiusLabel,
  homeAlertCaption,
  homeFilterActive,
  filterPermitsNearHome,
  isSameLocation,
  HOME_RADIUS_OPTIONS,
  DEFAULT_HOME_RADIUS_M,
  type HomeLocation,
} from './home-location';

const HOME: HomeLocation = { coords: { lat: 44.4949, lon: 11.3426 }, label: 'Via Rizzoli 1' };

describe('serializeHome / parseStoredHome', () => {
  it('round-trips a home through the store', () => {
    expect(parseStoredHome(serializeHome(HOME))).toEqual(HOME);
  });

  it('round-trips a null (cleared) home', () => {
    expect(serializeHome(null)).toBe('null');
    expect(parseStoredHome('null')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseStoredHome('{not json')).toBeNull();
    expect(parseStoredHome('')).toBeNull();
  });

  it('returns null when the shape is wrong', () => {
    expect(parseStoredHome('42')).toBeNull();
    expect(parseStoredHome('[1,2]')).toBeNull();
    expect(parseStoredHome(JSON.stringify({ label: 'x' }))).toBeNull();
  });

  it('rejects a non-finite or out-of-range coordinate', () => {
    expect(parseStoredHome(JSON.stringify({ lat: 91, lon: 11, label: 'x' }))).toBeNull();
    expect(parseStoredHome(JSON.stringify({ lat: 44, lon: 181, label: 'x' }))).toBeNull();
    expect(parseStoredHome(JSON.stringify({ lat: 'nope', lon: 11, label: 'x' }))).toBeNull();
    expect(parseStoredHome(JSON.stringify({ lat: null, lon: 11, label: 'x' }))).toBeNull();
  });

  it('falls back to a default label when it is missing or blank', () => {
    expect(parseStoredHome(JSON.stringify({ lat: 44.49, lon: 11.34 }))?.label).toBe('Posizione');
    expect(parseStoredHome(JSON.stringify({ lat: 44.49, lon: 11.34, label: '   ' }))?.label).toBe(
      'Posizione'
    );
  });
});

describe('sanitizeHomeRadius', () => {
  it('passes a valid option through', () => {
    for (const opt of HOME_RADIUS_OPTIONS) expect(sanitizeHomeRadius(opt)).toBe(opt);
  });

  it('snaps an off-list value to the nearest option', () => {
    expect(sanitizeHomeRadius(340)).toBe(300);
    expect(sanitizeHomeRadius(700)).toBe(500);
    expect(sanitizeHomeRadius(900)).toBe(1000);
    expect(sanitizeHomeRadius(5000)).toBe(2000);
  });

  it('defaults on a non-finite value', () => {
    expect(sanitizeHomeRadius(NaN)).toBe(DEFAULT_HOME_RADIUS_M);
    expect(sanitizeHomeRadius(Infinity)).toBe(DEFAULT_HOME_RADIUS_M);
  });
});

describe('formatRadiusLabel', () => {
  it('renders metres under a kilometre', () => {
    expect(formatRadiusLabel(300)).toBe('300 m');
    expect(formatRadiusLabel(500)).toBe('500 m');
  });

  it('renders kilometres with an Italian decimal comma', () => {
    expect(formatRadiusLabel(1000)).toBe('1 km');
    expect(formatRadiusLabel(2000)).toBe('2 km');
    expect(formatRadiusLabel(1500)).toBe('1,5 km');
  });
});

describe('homeAlertCaption', () => {
  it('promises the radius-scoped alert only when home set AND notifications on', () => {
    expect(homeAlertCaption(HOME, true, 500)).toBe(
      'Ti avviseremo per le nuove pratiche entro 500 m da casa'
    );
    expect(homeAlertCaption(HOME, true, 1000)).toBe(
      'Ti avviseremo per le nuove pratiche entro 1 km da casa'
    );
  });

  it('is null when the alert would not fire (no home, or notifications off)', () => {
    expect(homeAlertCaption(null, true, 500)).toBeNull();
    expect(homeAlertCaption(HOME, false, 500)).toBeNull();
    expect(homeAlertCaption(null, false, 500)).toBeNull();
  });

  it('states the radius via the shared formatter (Italian km comma)', () => {
    expect(homeAlertCaption(HOME, true, 1500)).toContain('1,5 km');
  });
});

describe('homeFilterActive', () => {
  it('is active only when enabled AND a home is set', () => {
    expect(homeFilterActive(HOME, true)).toBe(true);
    expect(homeFilterActive(HOME, false)).toBe(false);
    expect(homeFilterActive(null, true)).toBe(false);
    expect(homeFilterActive(null, false)).toBe(false);
  });
});

describe('filterPermitsNearHome', () => {
  // Points around the Via Rizzoli home: near (~150 m), far (~2 km), no coord.
  const near = { id: 1, c: { lat: 44.4962, lon: 11.3426 } as Coords };
  const far = { id: 2, c: { lat: 44.513, lon: 11.361 } as Coords };
  const noCoord = { id: 3, c: null as Coords | null };
  const items = [near, far, noCoord];
  const getCoord = (x: (typeof items)[number]) => x.c;

  it('keeps only rows within the radius, order preserved', () => {
    expect(filterPermitsNearHome(HOME, 500, items, getCoord)).toEqual([near]);
  });

  it('widens with a larger radius', () => {
    expect(filterPermitsNearHome(HOME, 3000, items, getCoord)).toEqual([near, far]);
  });

  it('drops coordinate-less rows', () => {
    const kept = filterPermitsNearHome(HOME, 3000, items, getCoord);
    expect(kept).not.toContain(noCoord);
  });
});

describe('isSameLocation', () => {
  it('matches within a ~1 m epsilon', () => {
    expect(
      isSameLocation({ lat: 44.4949, lon: 11.3426 }, { lat: 44.49490004, lon: 11.34260004 })
    ).toBe(true);
  });

  it('separates distinct points', () => {
    expect(isSameLocation({ lat: 44.49, lon: 11.34 }, { lat: 44.51, lon: 11.36 })).toBe(false);
  });

  it('is false when either side is null', () => {
    expect(isSameLocation(null, { lat: 44.49, lon: 11.34 })).toBe(false);
    expect(isSameLocation({ lat: 44.49, lon: 11.34 }, null)).toBe(false);
    expect(isSameLocation(null, null)).toBe(false);
  });
});
