import { describe, it, expect } from 'vitest';
import { STATIC_LAYERS, STATIC_LAYER_IDS, type StaticLayerId } from './static-layers';
import { CATEGORY_COLORS, CATEGORIES } from './sources';

describe('static-layer registry', () => {
  it('has one config per id, self-consistently keyed', () => {
    // STATIC_LAYERS keys and STATIC_LAYER_IDS are the same set (no orphan config,
    // no id without a config).
    expect(Object.keys(STATIC_LAYERS).sort()).toEqual([...STATIC_LAYER_IDS].sort());
    for (const id of STATIC_LAYER_IDS) {
      const config = STATIC_LAYERS[id];
      // The registry key, the config.id, and the enumerated id all agree.
      expect(config.id).toBe(id);
    }
  });

  it('gives every layer a non-empty label, slug, color and glyph', () => {
    for (const id of STATIC_LAYER_IDS) {
      const { label, slug, color, ionicon } = STATIC_LAYERS[id];
      expect(label.length).toBeGreaterThan(0);
      expect(slug.length).toBeGreaterThan(0);
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(ionicon.length).toBeGreaterThan(0);
    }
  });

  it('colors every layer distinctly from each other and from every category accent', () => {
    // A static marker must never read as a followed permit: its hue is off every
    // CATEGORY_COLORS accent/bg. And two layers must not share a color.
    const categoryColors = new Set<string>();
    for (const c of CATEGORIES) {
      categoryColors.add(CATEGORY_COLORS[c].text.toLowerCase());
      categoryColors.add(CATEGORY_COLORS[c].bg.toLowerCase());
    }
    const seen = new Set<string>();
    for (const id of STATIC_LAYER_IDS) {
      const color = STATIC_LAYERS[id].color.toLowerCase();
      expect(categoryColors.has(color)).toBe(false);
      expect(seen.has(color)).toBe(false);
      seen.add(color);
    }
  });

  it('registry exhaustiveness holds at the type level (compile-time witness)', () => {
    // A Record<StaticLayerId, …> built by iterating the id tuple compiles only when
    // the tuple and the union agree — the runtime assert just exercises it.
    const label: Record<StaticLayerId, string> = STATIC_LAYER_IDS.reduce(
      (acc, id) => {
        acc[id] = STATIC_LAYERS[id].label;
        return acc;
      },
      {} as Record<StaticLayerId, string>
    );
    expect(label.farmacie).toBe('Farmacie');
    expect(label.scuole).toBe('Scuole');
  });
});

describe('static-layer parser map', () => {
  it('pairs a page parser to every static layer id (runtime parity, not just tsc)', async () => {
    // tsc already forces STATIC_LAYER_PARSERS to be a Record<StaticLayerId, …>, but a
    // runtime coverage check mirrors the `sources.ts` category-parser parity test and
    // catches an id/parser-map drift a `Partial`-shaped regression could sneak past.
    const { STATIC_LAYER_PARSERS } = await import('./static-layer-sync');
    expect(Object.keys(STATIC_LAYER_PARSERS).sort()).toEqual([...STATIC_LAYER_IDS].sort());
    for (const id of STATIC_LAYER_IDS) {
      expect(typeof STATIC_LAYER_PARSERS[id]).toBe('function');
    }
  });
});
