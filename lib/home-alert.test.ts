import { describe, it, expect } from 'vitest';
import {
  countNearHome,
  buildNearHomeBody,
  chooseNotificationBody,
  type NearHomeCandidate,
} from './home-alert';
import type { HomeLocation } from './home-location';
import type { NotificationSummary } from './notification-message';
import type { Coords } from './permit-extra';

const HOME: HomeLocation = { coords: { lat: 44.4949, lon: 11.3426 }, label: 'Casa' };

/** ~166 m north of home (0.0015° lat ≈ 166 m). */
const NEAR: Coords = { lat: 44.4949 + 0.0015, lon: 11.3426 };
/** ~5.5 km north of home — outside every offered radius. */
const FAR: Coords = { lat: 44.4949 + 0.05, lon: 11.3426 };

function cand(coords: Coords | null): NearHomeCandidate {
  return { coords };
}

function sum(partial: Partial<NotificationSummary>): NotificationSummary {
  return { totalNew: 0, totalUpdated: 0, newByCategory: {}, ...partial };
}

describe('countNearHome', () => {
  it('returns 0 when no home is set (feature off)', () => {
    expect(countNearHome(null, 500, [cand(NEAR), cand(NEAR)])).toBe(0);
  });

  it('counts only rows within the radius', () => {
    expect(countNearHome(HOME, 500, [cand(NEAR), cand(FAR), cand(NEAR)])).toBe(2);
  });

  it('excludes rows without a coordinate (not geocoded / no coord source)', () => {
    expect(countNearHome(HOME, 500, [cand(NEAR), cand(null), cand(null)])).toBe(1);
  });

  it('a tighter radius drops a row a wider one would keep', () => {
    // NEAR is ~166 m out: inside 500 m, outside 300 m? 166 < 300, so inside both;
    // use a point ~166 m to confirm 300 keeps it and 100 drops it.
    expect(countNearHome(HOME, 300, [cand(NEAR)])).toBe(1);
    expect(countNearHome(HOME, 100, [cand(NEAR)])).toBe(0);
  });

  it('a garbage radius collapses to 0 metres (only an exact-home row counts)', () => {
    expect(countNearHome(HOME, Number.NaN, [cand(NEAR)])).toBe(0);
    expect(countNearHome(HOME, -1, [cand(NEAR)])).toBe(0);
    expect(countNearHome(HOME, 500, [cand(HOME.coords)])).toBe(1);
  });
});

describe('buildNearHomeBody', () => {
  it('null when nothing is near', () => {
    expect(buildNearHomeBody(0)).toBeNull();
    expect(buildNearHomeBody(-3)).toBeNull();
    expect(buildNearHomeBody(Number.NaN)).toBeNull();
  });

  it('singular / plural Italian', () => {
    expect(buildNearHomeBody(1)).toBe('1 pratica vicino a casa');
    expect(buildNearHomeBody(4)).toBe('4 pratiche vicino a casa');
  });

  it('floors a fractional count', () => {
    expect(buildNearHomeBody(2.9)).toBe('2 pratiche vicino a casa');
  });
});

describe('chooseNotificationBody', () => {
  it('targeted near-home body when a home is set and rows land nearby', () => {
    const body = chooseNotificationBody(
      HOME,
      500,
      [cand(NEAR), cand(FAR)],
      sum({ totalNew: 2, newByCategory: { edilizia: 2 } })
    );
    expect(body).toBe('1 pratica vicino a casa');
  });

  it('falls back to the generic body when no home is set', () => {
    const body = chooseNotificationBody(
      null,
      500,
      [],
      sum({ totalNew: 3, newByCategory: { cantieri: 3 } })
    );
    expect(body).toBe('3 nuovi cantieri');
  });

  it('falls back to the generic body when a home is set but nothing landed near it', () => {
    const body = chooseNotificationBody(
      HOME,
      500,
      [cand(FAR), cand(null)],
      sum({ totalNew: 1, newByCategory: { commercio: 1 } })
    );
    expect(body).toBe('1 nuova attività');
  });

  it('returns null when there is nothing worth notifying about', () => {
    expect(chooseNotificationBody(HOME, 500, [], sum({}))).toBeNull();
    expect(chooseNotificationBody(null, 500, [], sum({}))).toBeNull();
  });
});
