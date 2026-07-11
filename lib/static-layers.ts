/**
 * STATIC CONTEXT LAYERS — the map-only reference overlays (docs/ROADMAP.md §4b,
 * "Layer statici, fase 2 di P4"): farmacie, and later scuole / ZTL / mercati.
 *
 * These are NOT a {@link import('./sources').Category}. A category is a
 * date-bearing, syncable, WATCHABLE data source that flows into the feed and the
 * notifications; a static layer is inert reference data — no dates, never synced
 * into the `permits` table, never notified, MAP-ONLY and toggleable (default OFF).
 * Modelling one as a `SourceConfig`/`Category` would drag it through the exhaustive
 * `CATEGORY_*` maps and the sync pipeline it must stay out of (the same reasoning
 * that kept the `rifter_civici_pt` gazetteer out of the source registry). So static
 * layers get their OWN small registry here.
 *
 * PURE + library-agnostic: no `react-native-maps`, no `expo-sqlite`, no
 * `@expo/vector-icons` runtime import — only plain data — so it is unit-testable in
 * vitest and both the native and web map surfaces consume it without owning any
 * layer knowledge. {@link StaticMarker} mirrors `lib/map-pins.ts`'s `MapPin`: a
 * flat, native-free marker model.
 */

/**
 * Every static layer id. A `const` tuple (mirroring `CATEGORIES` in `sources.ts`)
 * so the {@link StaticLayerId} union derives from it and adding a layer is a
 * one-line append here — the exhaustive {@link STATIC_LAYERS} record below then
 * fails the build until the new id gets its config.
 */
export const STATIC_LAYER_IDS = ['farmacie'] as const;
export type StaticLayerId = (typeof STATIC_LAYER_IDS)[number];

/**
 * Configuration for one static layer. DATA ONLY (no schema/normalizer refs — those
 * live in the per-layer `source-*.ts` + the `static-layer-sync.ts` parser map, so
 * this module stays a leaf). `color` is the marker + legend hue and MUST be
 * distinct from every `CATEGORY_COLORS` accent and the wine-red home anchor, so a
 * static marker never reads as a followed permit; `ionicon` names the Ionicons
 * glyph the map's toggle chip shows.
 */
export interface StaticLayerConfig {
  readonly id: StaticLayerId;
  /** Italian label for the toggle chip + legend, e.g. "Farmacie". */
  readonly label: string;
  /** ODS dataset slug on opendata.comune.bologna.it. */
  readonly slug: string;
  /** Marker/legend hue — a distinct medical teal-green, off every category color. */
  readonly color: string;
  /** Ionicons glyph name for the toggle chip. */
  readonly ionicon: string;
}

/**
 * The static-layer registry: each id → its label, ODS slug, marker color and
 * toggle glyph. `as const satisfies` (the `SOURCES` idiom) keeps every field's
 * literal type — so `STATIC_LAYERS[id].ionicon` stays a literal assignable to the
 * Ionicons `name` prop with no cast — while the `satisfies` guarantees the shape.
 *
 * `farmacie` = the Bologna pharmacy gazetteer (dataset `farmacie`, 125 rows). Its
 * teal-green `#1B9E77` reads as the Italian pharmacy green cross yet sits clearly
 * off `commercio`'s forest `#2F6B3A` (and every other category accent), so the two
 * are never confused even as small markers.
 */
export const STATIC_LAYERS = {
  farmacie: {
    id: 'farmacie',
    label: 'Farmacie',
    slug: 'farmacie',
    color: '#1B9E77',
    ionicon: 'medkit',
  },
} as const satisfies Record<StaticLayerId, StaticLayerConfig>;

/**
 * One placed marker for a static layer — the pure read-model the map surfaces
 * render. Library-agnostic like {@link import('./map-pins').MapPin}, but keyed by a
 * STRING id (the source record's stable id, e.g. a farmacia `civkey`) and tagged
 * with its `layer` so a mixed marker set stays groupable. It carries no permit id
 * and never routes to `/permit/[id]` — a static marker is reference data, not a
 * followed record.
 */
export interface StaticMarker {
  /** Stable source id (e.g. farmacia `civkey`). */
  id: string;
  lat: number;
  lon: number;
  layer: StaticLayerId;
  /** Callout title (e.g. the pharmacy name). */
  title: string;
  /** Callout subtitle (e.g. the address), or `null` when none is available. */
  subtitle: string | null;
  /** Marker color = the layer's {@link StaticLayerConfig.color}. */
  color: string;
}
