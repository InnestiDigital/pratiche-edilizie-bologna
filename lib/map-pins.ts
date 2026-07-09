import type { Permit } from './queries';
import type { Category } from './sources';
import { CATEGORY_COLORS } from './sources';
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
  for (const p of permits) {
    const coords = getCoords(p.extra);
    if (!coords) {
      withoutCoords += 1;
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
  return { pins, withoutCoords };
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
