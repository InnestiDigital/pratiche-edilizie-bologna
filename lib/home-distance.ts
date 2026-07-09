import type { Coords } from './permit-extra';
import { haversineMeters } from './geo-distance';
import type { HomeLocation } from './home-location';

/**
 * Pure core for the P4 "Vicino a casa" distance surfacing (docs/P4-map-radius.md
 * §5 — mandate #3): once the feed is narrowed to the home radius, each card can
 * say HOW FAR the permit is from home ("~350 m", "~1,2 km"). The radius scan is
 * already in memory (see `home-location.ts::filterPermitsNearHome`), so this only
 * needs the two testable decisions — the home→point distance and its human label
 * — while the device-coupled feed stays thin and delegates here.
 *
 * Reuses the already-tested `haversineMeters` (no native map dependency); the
 * feature is purely additive on top of the shipped radius filter.
 */

/**
 * Great-circle distance in metres from the user's home to a coordinate. A thin
 * named wrapper over {@link haversineMeters} so the feed reads one intent-named
 * unit ("how far is this from home") instead of reaching for the raw geometry.
 */
export function homeDistanceMeters(home: HomeLocation, point: Coords): number {
  return haversineMeters(home.coords, point);
}

/**
 * A glanceable approximate distance label: "~350 m" under a kilometre (rounded
 * to the nearest 10 m, never below 10), "~1,2 km" at or above (one decimal,
 * Italian decimal comma, a whole value dropping its ",0" → "~2 km"). Non-finite
 * or non-positive input collapses to the "~10 m" floor so a corrupt coordinate
 * can never render "NaN"/"-5 m" on a card.
 *
 * The m-vs-km branch is decided on the ROUNDED metres, not the raw input, so a
 * value in `[995, 1000)` — which rounds up to `1000` — reads as "~1 km" rather
 * than the contradictory "~1000 m" (a metre label at/over 1 km). Mirrors the
 * same boundary fix in `nearby-permits.ts::formatNearbyDistance`.
 */
export function formatDistanceApprox(meters: number): string {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  const roundedM = Math.max(10, Math.round(m / 10) * 10);
  if (roundedM < 1000) {
    return `~${roundedM} m`;
  }
  const km = Math.round(m / 100) / 10;
  const label = Number.isInteger(km) ? `${km}` : km.toFixed(1).replace('.', ',');
  return `~${label} km`;
}

/**
 * The distance from home to a coordinate, already labelled. Convenience for the
 * feed: one call per near-home card. `null` point (no/absent coord) yields `null`
 * so the caller renders no distance chip rather than a bogus "~10 m".
 */
export function distanceLabelFromHome(home: HomeLocation, point: Coords | null): string | null {
  if (point === null) return null;
  return formatDistanceApprox(homeDistanceMeters(home, point));
}
