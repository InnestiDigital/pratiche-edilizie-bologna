import type { Permit } from './queries';
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_NOUNS, type Category } from './sources';
import { getCoords } from './permit-extra';

/**
 * A single map marker derived from a stored permit — the pure read-model behind
 * the P4 map view (docs/P4-map-radius.md §5 slice 5). Kept library-agnostic (no
 * `react-native-maps` import) so it is unit-testable in vitest and the native
 * `<MapView>` component consumes it without owning any transform logic.
 */
export interface MapPin {
  id: number;
  lat: number;
  lon: number;
  category: Category;
  /** Marker color = the category's saturated text color (matches the feed dots). */
  color: string;
  /** Callout title: the card headline (address for edilizia, `title` otherwise). */
  title: string;
  /** Callout subtitle: the procedimento / filing description, when present. */
  subtitle: string | null;
}

/**
 * A map viewport, mirroring `react-native-maps`' `Region` shape without importing
 * the native module — center + span in degrees. The map component passes this
 * straight to `<MapView initialRegion>`.
 */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Result of projecting a permit list onto the map: the placeable pins plus how
 * many rows were dropped for lacking a usable coordinate (surfaced in the UI so
 * the omission is honest, never silent — e.g. not-yet-geocoded edilizia rows). */
export interface MapPinsResult {
  pins: MapPin[];
  /** Count of permits with no/invalid coordinate — excluded from `pins`. */
  withoutCoords: number;
  /**
   * The `withoutCoords` count broken down by category (only categories with at
   * least one coordinate-less row appear). Lets the UI name *what* is missing —
   * "8 pratiche senza posizione" instead of an opaque "8 senza posizione" — and
   * stays correct as device geocoding fills a category in (its entry drops out).
   */
  withoutByCategory: Partial<Record<Category, number>>;
}

/** Piazza Maggiore, Bologna — the fallback center when no pin has a coordinate. */
export const BOLOGNA_CENTER: MapRegion = {
  latitude: 44.4938,
  longitude: 11.3426,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** Minimum viewport span (degrees) so a single pin isn't shown fully zoomed-in. */
const MIN_DELTA = 0.01;
/** Fraction of the pin bounding-box added as padding around the fitted region. */
const PADDING = 0.25;

/** Metres per degree of latitude (constant on a sphere; good to ~0.1% for a map). */
const METERS_PER_DEG_LAT = 111_320;

/**
 * The home overlay drawn on the map when the user has set a "vicino a casa" anchor
 * (docs/P4-map-radius.md §5) — the home coordinate plus the chosen radius. Pure
 * data (no native import) so the region math and the web placeholder both consume
 * it; the native map turns the radius into a true metric `<Circle>`.
 */
export interface HomeMarker {
  lat: number;
  lon: number;
  /** The "vicino a casa" radius, in metres. */
  radiusMeters: number;
  /** Display label (the address the home was anchored from). */
  label: string;
}

/** Latitude degrees spanned by a north–south distance in metres. */
export function metersToLatDelta(meters: number): number {
  return meters / METERS_PER_DEG_LAT;
}

/**
 * Longitude degrees spanned by an east–west distance in metres at a given latitude
 * (meridians converge toward the poles, so the span widens as `cos(lat)` shrinks).
 * The cosine is floored to guard the poles (`cos → 0` would blow the span up).
 */
export function metersToLonDelta(meters: number, atLat: number): number {
  const scale = Math.cos(atLat * (Math.PI / 180));
  const denom = METERS_PER_DEG_LAT * (scale > 1e-6 ? scale : 1);
  return meters / denom;
}

const cardTitle = (p: Permit): string =>
  (p.title ?? p.address ?? p.procedimento ?? '').trim() || 'Voce senza titolo';

const cardSubtitle = (p: Permit): string | null => {
  // For edilizia the address is the headline, so the procedimento is the useful
  // subtitle; for other categories the address (when present) locates the pin.
  const sub = p.category === 'edilizia' ? p.procedimento : p.address;
  const trimmed = sub?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Project a permit list onto map pins, dropping rows without a usable coordinate
 * (`getCoords` returns `null`) and reporting how many were dropped. Input order is
 * preserved so a caller can rely on a stable marker order. Pure — no DB, no native.
 */
export function toMapPins(permits: readonly Permit[]): MapPinsResult {
  const pins: MapPin[] = [];
  let withoutCoords = 0;
  const withoutByCategory: Partial<Record<Category, number>> = {};
  for (const p of permits) {
    const coords = getCoords(p.extra);
    if (!coords) {
      withoutCoords += 1;
      withoutByCategory[p.category] = (withoutByCategory[p.category] ?? 0) + 1;
      continue;
    }
    pins.push({
      id: p.id,
      lat: coords.lat,
      lon: coords.lon,
      category: p.category,
      color: CATEGORY_COLORS[p.category].text,
      title: cardTitle(p),
      subtitle: cardSubtitle(p),
    });
  }
  return { pins, withoutCoords, withoutByCategory };
}

/**
 * Human phrase for the map's coverage chip describing the coordinate-less rows —
 * "8 pratiche senza posizione" when they are all one category (the common case:
 * not-yet-geocoded edilizia), "12 voci senza posizione" when mixed. Returns `null`
 * when nothing is missing so the caller omits the clause. The category noun comes
 * from {@link CATEGORY_NOUNS}, the single source of truth, so it stays consistent
 * with the notification copy. Pure.
 */
export function describeWithoutCoords(
  withoutByCategory: Partial<Record<Category, number>>
): string | null {
  const present = CATEGORIES.filter((c) => (withoutByCategory[c] ?? 0) > 0);
  if (present.length === 0) return null;
  const total = present.reduce((sum, c) => sum + (withoutByCategory[c] ?? 0), 0);
  let noun: string;
  if (present.length === 1) {
    const n = CATEGORY_NOUNS[present[0]];
    noun = total === 1 ? n.singularNoun : n.pluralNoun;
  } else {
    noun = total === 1 ? 'voce' : 'voci';
  }
  return `${total} ${noun} senza posizione`;
}

/**
 * Compute the map viewport that frames every pin (center = bounding-box midpoint,
 * span = box size + padding, floored at `MIN_DELTA`). Returns {@link BOLOGNA_CENTER}
 * when there are no pins so the map always opens on the city, never on `NaN`. Pure.
 */
export function pinsRegion(pins: readonly MapPin[]): MapRegion {
  if (pins.length === 0) return BOLOGNA_CENTER;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const pin of pins) {
    if (pin.lat < minLat) minLat = pin.lat;
    if (pin.lat > maxLat) maxLat = pin.lat;
    if (pin.lon < minLon) minLon = pin.lon;
    if (pin.lon > maxLon) maxLon = pin.lon;
  }

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(latSpan * (1 + PADDING), MIN_DELTA),
    longitudeDelta: Math.max(lonSpan * (1 + PADDING), MIN_DELTA),
  };
}

/**
 * The map viewport framing every pin AND the whole home circle, when a home is set
 * — so the "vicino a casa" radius is always visible even when it sits outside the
 * pin cloud (or when there are no pins yet). Falls back to {@link BOLOGNA_CENTER}
 * when there is nothing to frame. Pure; the same padding/min-delta rules as
 * {@link pinsRegion}, extended with the home circle's degree bounds.
 */
export function mapViewport(pins: readonly MapPin[], home: HomeMarker | null): MapRegion {
  const lats: number[] = [];
  const lons: number[] = [];
  for (const pin of pins) {
    lats.push(pin.lat);
    lons.push(pin.lon);
  }
  if (home) {
    const dLat = metersToLatDelta(home.radiusMeters);
    const dLon = metersToLonDelta(home.radiusMeters, home.lat);
    lats.push(home.lat - dLat, home.lat + dLat);
    lons.push(home.lon - dLon, home.lon + dLon);
  }
  if (lats.length === 0) return BOLOGNA_CENTER;

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * (1 + PADDING), MIN_DELTA),
    longitudeDelta: Math.max((maxLon - minLon) * (1 + PADDING), MIN_DELTA),
  };
}

/**
 * The home circle's on-plane size as a fraction of the given region span — the web
 * placeholder map uses this to size the radius ring (the native map draws a true
 * metric `<Circle>` and needs no fraction). Values can exceed 1 when the circle is
 * larger than the viewport; the caller clamps for display. Pure.
 */
export function homeCircleFraction(
  home: HomeMarker,
  region: MapRegion
): { widthFrac: number; heightFrac: number } {
  return {
    widthFrac: (2 * metersToLonDelta(home.radiusMeters, home.lat)) / region.longitudeDelta,
    heightFrac: (2 * metersToLatDelta(home.radiusMeters)) / region.latitudeDelta,
  };
}
