import { describe, it, expect } from 'vitest';
import { reconcileGeocodedExtra } from './upsert-reconcile';
import { classifyUpsert, type PermitContent } from './upsert-classify';
import { planCiviciBackfill } from './civici-backfill';
import { buildCiviciIndex } from './geocode-civici';

/**
 * A representative edilizia content row (no source coordinate). `extra` holds only
 * the `civico`, as `normalize.ts` writes it; `codvia` is the promoted street code.
 */
function edilizia(overrides: Partial<PermitContent> = {}): PermitContent {
  return {
    source_updated_at: '2025-03-01',
    address: 'Via Marconi 12',
    zone: 'Porto-Saragozza',
    codvia: 4210,
    procedimento: 'PDC ORDINARIO',
    date_issued: '2025-06-01',
    status: 'rilasciata',
    status_raw: 'Rilasciata',
    tags: '["ristrutturazione"]',
    source_link: 'https://portal/pdc/2025/1',
    title: null,
    extra: '{"civico":"12"}',
    ...overrides,
  };
}

/** The `extra` a geocoded edilizia row carries once the back-fill merged its pin. */
const GEOCODED_EXTRA = '{"civico":"12","lat":"44.49","lon":"11.34"}';

describe('reconcileGeocodedExtra', () => {
  it('carries the stored pin into an unchanged edilizia re-sync — byte-identical', () => {
    const stored = edilizia({ extra: GEOCODED_EXTRA });
    const incoming = edilizia({ extra: '{"civico":"12"}' });

    const reconciled = reconcileGeocodedExtra(stored, incoming);

    // The merged extra round-trips exactly to what the back-fill wrote, so the
    // string-equality change detection sees no change.
    expect(reconciled.extra).toBe(GEOCODED_EXTRA);
  });

  it('makes an otherwise-unchanged geocoded edilizia row classify as unchanged (no wipe, no phantom alert)', () => {
    const stored = edilizia({ extra: GEOCODED_EXTRA });
    const incoming = edilizia({ extra: '{"civico":"12"}' });

    // Without the reconcile, this is the exact bug: stored (3-key) vs incoming
    // (1-key) extra differ → 'updated' → coordinate wiped + is_new re-flagged.
    expect(classifyUpsert(stored, incoming, 0)).toBe('updated');

    // With the reconcile, the row correctly reads unchanged.
    const reconciled = reconcileGeocodedExtra(stored, incoming);
    expect(classifyUpsert(stored, reconciled, 0)).toBe('unchanged');
  });

  it('keeps the pin on a genuine content change (address corrected, join keys unchanged)', () => {
    const stored = edilizia({ extra: GEOCODED_EXTRA });
    const incoming = edilizia({ extra: '{"civico":"12"}', address: 'Via Marconi 12/A' });

    const reconciled = reconcileGeocodedExtra(stored, incoming);

    // Still classified updated (the address really changed)...
    expect(classifyUpsert(stored, reconciled, 0)).toBe('updated');
    // ...but the coordinate survives the rewrite instead of being wiped.
    expect(reconciled.extra).toBe(GEOCODED_EXTRA);
    expect(reconciled.address).toBe('Via Marconi 12/A');
  });

  it('drops a stale pin when the civico join key changes (lets the next back-fill re-geocode)', () => {
    const stored = edilizia({ extra: GEOCODED_EXTRA });
    const incoming = edilizia({ extra: '{"civico":"14"}' });

    const reconciled = reconcileGeocodedExtra(stored, incoming);

    // The pin was for civico 12; civico is now 14, so the old coordinate is stale
    // and must NOT be carried — the reconciled extra keeps only the new civico.
    expect(reconciled.extra).toBe('{"civico":"14"}');
  });

  it('drops a stale pin when the codvia join key changes', () => {
    const stored = edilizia({ extra: GEOCODED_EXTRA });
    const incoming = edilizia({ extra: '{"civico":"12"}', codvia: 9999 });

    const reconciled = reconcileGeocodedExtra(stored, incoming);

    expect(reconciled.extra).toBe('{"civico":"12"}');
  });

  it('returns incoming untouched when the stored row has no pin', () => {
    const stored = edilizia({ extra: '{"civico":"12"}' });
    const incoming = edilizia({ extra: '{"civico":"12"}' });

    expect(reconcileGeocodedExtra(stored, incoming)).toBe(incoming);
  });

  it('never carries a corrupt / out-of-range stored pin', () => {
    // lat 999 is out of WGS84 range → getCoords rejects it, so it is not carried.
    const stored = edilizia({ extra: '{"civico":"12","lat":"999","lon":"11.34"}' });
    const incoming = edilizia({ extra: '{"civico":"12"}' });

    expect(reconcileGeocodedExtra(stored, incoming)).toBe(incoming);
  });

  it('leaves a source-geocoded incoming row untouched (non-edilizia carries its own pin)', () => {
    // A cantieri-style row already carries a coordinate in `extra`; the first
    // guard returns immediately, and nothing from `existing` is merged.
    const stored = edilizia({ extra: '{"lat":"44.50","lon":"11.35"}' });
    const incoming = edilizia({ extra: '{"lat":"44.49","lon":"11.34"}' });

    expect(reconcileGeocodedExtra(stored, incoming)).toBe(incoming);
  });

  it('round-trips against the real back-fill output (regression: sync ↔ back-fill are inverse-stable)', () => {
    // Build the exact stored extra the back-fill produces, then prove a re-sync of
    // the same row does not re-diff it. This crosses the two modules that the bug
    // lived between.
    const index = buildCiviciIndex([{ codvia: 4210, civico: 12, lat: 44.49, lon: 11.34 }]);
    const plan = planCiviciBackfill(
      [{ source_id: 'pdc/1', codvia: 4210, extra: '{"civico":"12"}' }],
      index
    );
    const backfilledExtra = plan.updates[0].extra;

    const stored = edilizia({ extra: backfilledExtra });
    const incoming = edilizia({ extra: '{"civico":"12"}' });
    const reconciled = reconcileGeocodedExtra(stored, incoming);

    expect(reconciled.extra).toBe(backfilledExtra);
    expect(classifyUpsert(stored, reconciled, 0)).toBe('unchanged');
  });
});
