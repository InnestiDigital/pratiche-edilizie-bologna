import { describe, it, expect } from 'vitest';
import { planCiviciBackfill, type EdiliziaBackfillRow } from './civici-backfill';
import { buildCiviciIndex, type CiviciRecord } from './geocode-civici';
import { getCoords } from './permit-extra';

// A tiny gazetteer: street 4230 has two exact civici; street 4231 has one
// (its centroid is that single point); street 9999 is unknown.
const GAZETTEER: CiviciRecord[] = [
  { codvia: 4230, civico: 12, lat: 44.4949, lon: 11.3426 },
  { codvia: 4230, civico: 14, lat: 44.495, lon: 11.343 },
  { codvia: 4231, civico: 1, lat: 44.5, lon: 11.35 },
];
const index = buildCiviciIndex(GAZETTEER);

function row(overrides: Partial<EdiliziaBackfillRow> = {}): EdiliziaBackfillRow {
  return {
    source_id: 'pdc-2024-1',
    codvia: 4230,
    extra: JSON.stringify({ civico: '12' }),
    ...overrides,
  };
}

describe('planCiviciBackfill', () => {
  it('geocodes an exact codvia+civico hit and merges lat/lon into the existing extra', () => {
    const plan = planCiviciBackfill([row()], index);
    expect(plan.geocoded).toBe(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].source_id).toBe('pdc-2024-1');
    // civico preserved, coordinate appended
    expect(JSON.parse(plan.updates[0].extra)).toEqual({
      civico: '12',
      lat: '44.4949',
      lon: '11.3426',
    });
    // the merged extra round-trips through the on-device coord decoder
    expect(getCoords(plan.updates[0].extra)).toEqual({ lat: 44.4949, lon: 11.3426 });
  });

  it('falls back to the street centroid when the civico is absent or unmatched', () => {
    // no civico in extra → street centroid of 4230
    const plan = planCiviciBackfill([row({ extra: '{}' })], index);
    const coords = getCoords(plan.updates[0].extra)!;
    expect(coords.lat).toBeCloseTo((44.4949 + 44.495) / 2, 6);
    expect(coords.lon).toBeCloseTo((11.3426 + 11.343) / 2, 6);
  });

  it('is idempotent: a row that already has a coordinate is skipped', () => {
    const already = row({ extra: JSON.stringify({ civico: '12', lat: '44.1', lon: '11.1' }) });
    const plan = planCiviciBackfill([already], index);
    expect(plan.geocoded).toBe(0);
    expect(plan.alreadyCoded).toBe(1);
    expect(plan.updates).toHaveLength(0);
    // re-running the plan on a freshly-geocoded row also emits nothing
    const first = planCiviciBackfill([row()], index).updates[0];
    const second = planCiviciBackfill([{ ...row(), extra: first.extra }], index);
    expect(second.updates).toHaveLength(0);
    expect(second.alreadyCoded).toBe(1);
  });

  it('counts a row as unresolved when its street is unknown or codvia is null', () => {
    const plan = planCiviciBackfill(
      [row({ codvia: 9999 }), row({ source_id: 'pdc-2024-2', codvia: null })],
      index
    );
    expect(plan.unresolved).toBe(2);
    expect(plan.updates).toHaveLength(0);
  });

  it('tallies a mixed batch and only emits updates for the geocodable rows', () => {
    const plan = planCiviciBackfill(
      [
        row(), // geocoded
        row({ source_id: 'a', extra: JSON.stringify({ lat: '1', lon: '2' }) }), // already
        row({ source_id: 'b', codvia: 9999 }), // unresolved
      ],
      index
    );
    expect(plan).toMatchObject({ geocoded: 1, alreadyCoded: 1, unresolved: 1 });
    expect(plan.updates.map((u) => u.source_id)).toEqual(['pdc-2024-1']);
  });
});
