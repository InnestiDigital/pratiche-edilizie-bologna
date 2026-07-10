import type { Coords } from './permit-extra';

/**
 * Great-circle distance between two WGS84 coordinates, in metres (haversine).
 *
 * Pure + library-agnostic groundwork for the P4 "vicino a casa" radius alert
 * (docs/P4-map-radius.md §5 slice 2): the distance core the radius filter
 * (`geo-radius.ts`) is built on, so no native map dependency is needed to know
 * whether a permit sits near the user's home.
 *
 * Inputs are assumed already validated (finite, in-range degrees) — that is the
 * `permit-extra.ts::getCoords` boundary. The `a` term is clamped to `[0, 1]`
 * before `sqrt` so floating-point drift at (near-)antipodal points can never
 * produce `NaN`; the maximum returned value is ~half Earth's circumference
 * (~20 015 km).
 */

/** Mean Earth radius in metres (WGS84 authalic sphere). */
const EARTH_RADIUS_M = 6_371_008.8;

const DEG_TO_RAD = Math.PI / 180;

/** Haversine great-circle distance in metres. Always `>= 0`, `0` for the same point. */
export function haversineMeters(a: Coords, b: Coords): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  // Clamp: rounding can nudge h just past 1 at antipodes → sqrt(negative) = NaN.
  const clamped = h < 0 ? 0 : h > 1 ? 1 : h;
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return EARTH_RADIUS_M * c;
}

/**
 * The single canonical "~distance" label used everywhere the app shows how far a
 * coordinate is (the feed's "da casa" chip AND the permit-detail "Nei dintorni"
 * rows). ONE source of truth so the two surfaces cannot drift: rounded to the
 * nearest 10 m below a kilometre and never below 10 (`"~350 m"`), or one-decimal
 * km with an Italian decimal comma at/above a kilometre, a whole value dropping
 * its ",0" (`"~1,2 km"`, `"~2 km"`). Non-finite / non-positive input collapses to
 * the "~10 m" floor so a corrupt coordinate can never render "NaN"/"-5 m".
 *
 * The m-vs-km branch is decided on the ROUNDED metres, not the raw input, so a
 * value in `[995, 1000)` — which rounds up to `1000` — reads as "~1 km" rather
 * than the contradictory "~1000 m" (a metre label at/over a kilometre).
 */
export function formatApproxDistance(meters: number): string {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  const roundedM = Math.max(10, Math.round(m / 10) * 10);
  if (roundedM < 1000) {
    return `~${roundedM} m`;
  }
  const km = Math.round(m / 100) / 10;
  const label = Number.isInteger(km) ? `${km}` : km.toFixed(1).replace('.', ',');
  return `~${label} km`;
}
