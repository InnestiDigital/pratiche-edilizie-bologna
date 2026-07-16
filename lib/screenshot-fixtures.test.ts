import { describe, expect, it } from 'vitest';
import { STATIC_MARKER_FIXTURES } from './screenshot-fixtures';
import { STATIC_LAYERS, STATIC_LAYER_IDS } from './static-layers';

/**
 * `screenshot-fixtures.ts` is web-only (imported solely by the `*.web.ts` shims), so
 * tsc — not the app — is normally its only guard. That gap let a real drift ship: the
 * `scuole` static layer landed in the registry (commit fcb3815) but `STATIC_MARKER_FIXTURES`
 * kept only `farmacie` rows, so toggling scuole in the web export / screenshot harness
 * showed an EMPTY overlay and the loop could not SEE the new layer.
 *
 * This is the completeness instrument that makes that drift a red test instead of a
 * silent invisible layer: every {@link STATIC_LAYER_IDS} member must have at least one
 * fixture marker, and every marker must be a well-formed point on the correct layer with
 * the registry hue. The file is pure data (no native imports), so vitest imports it safely.
 */
describe('STATIC_MARKER_FIXTURES', () => {
  it('has at least one marker for every static layer id', () => {
    for (const id of STATIC_LAYER_IDS) {
      const forLayer = STATIC_MARKER_FIXTURES.filter((m) => m.layer === id);
      expect(forLayer.length, `layer "${id}" has no screenshot fixture marker`).toBeGreaterThan(0);
    }
  });

  it('tags every marker with a known layer', () => {
    const known = new Set<string>(STATIC_LAYER_IDS);
    for (const m of STATIC_MARKER_FIXTURES) {
      expect(known.has(m.layer), `marker ${m.id} has unknown layer "${m.layer}"`).toBe(true);
    }
  });

  it('colors every marker with its layer registry hue', () => {
    for (const m of STATIC_MARKER_FIXTURES) {
      expect(m.color, `marker ${m.id} color drifted from STATIC_LAYERS.${m.layer}`).toBe(
        STATIC_LAYERS[m.layer].color
      );
    }
  });

  it('places every marker on a finite, in-range WGS84 point', () => {
    for (const m of STATIC_MARKER_FIXTURES) {
      expect(Number.isFinite(m.lat) && Math.abs(m.lat) <= 90, `marker ${m.id} lat`).toBe(true);
      expect(Number.isFinite(m.lon) && Math.abs(m.lon) <= 180, `marker ${m.id} lon`).toBe(true);
    }
  });

  it('keys every marker uniquely (a duplicate id would drop a pin on the map)', () => {
    const ids = STATIC_MARKER_FIXTURES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
