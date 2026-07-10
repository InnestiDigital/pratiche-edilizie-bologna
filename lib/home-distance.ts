import type { Coords } from './permit-extra';
import { haversineMeters, formatApproxDistance } from './geo-distance';
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
 * A glanceable approximate distance label for the feed's "da casa" chip. A thin
 * intent-named wrapper over the shared {@link formatApproxDistance} so the feed
 * and the permit-detail "Nei dintorni" rows render one identical distance format
 * (single source of truth — see `geo-distance.ts::formatApproxDistance`).
 */
export function formatDistanceApprox(meters: number): string {
  return formatApproxDistance(meters);
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
