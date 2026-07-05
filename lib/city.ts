/**
 * The active city as a **configuration value, not a brand**.
 *
 * The app itself is city-neutral (the P3 rebrand names it "Civico"); Bologna is
 * a config — its display name, the public body that publishes the open data, the
 * region suffix that anchors free-text address geocoding, and the city accent
 * colour. Extracting these here is the P3 rebrand foundation (ROADMAP §4 "la
 * città come tema, non come brand") and the exact seam P5 (multi-city) will vary.
 * Today there is precisely one city.
 *
 * Data-side only: this holds the *city the data is about*, never app branding.
 * Every string that names Bologna as the data source (the geocode anchor, the
 * "Comune di Bologna" provenance label) reads from here, so adding a second city
 * is a config change rather than a copy sweep. The app brand name is deliberately
 * NOT modelled here — it belongs to the (city-neutral) product, not the city.
 */
export interface CityConfig {
  /** City display name, e.g. the label a resident recognises ("Bologna"). */
  readonly name: string;
  /** Public body publishing the open data, as shown in provenance copy. */
  readonly provider: string;
  /**
   * Region suffix appended to a bare street before geocoding (`Bologna, Italia`).
   * A street like `Via Marconi 24` is ambiguous nationwide; this anchors it.
   */
  readonly geocodeRegion: string;
  /** City accent colour (Bologna red) — the per-city theme accent. */
  readonly accent: string;
}

/** The single active city. Multi-city (P5) turns this into a lookup. */
export const CITY: CityConfig = {
  name: 'Bologna',
  provider: 'Comune di Bologna',
  geocodeRegion: 'Bologna, Italia',
  accent: '#9B2335',
} as const;
