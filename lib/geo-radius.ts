import type { Coords } from './permit-extra';
import { haversineMeters } from './geo-distance';

/**
 * Pure radius filter for the P4 "vicino a casa" alert (docs/P4-map-radius.md §5
 * slice 2): keep the local rows whose coordinate sits within `radiusMeters` of
 * the user's home. Library-agnostic — consumes the `extra.lat/lon` that slice-1
 * already stores (read via `permit-extra.ts::getCoords`) with no native map dep.
 *
 * Safety is load-bearing because the threshold comes from a user preference and
 * the coordinate from on-device storage:
 * - A non-finite or negative `radiusMeters` is sanitised to `0`. An invalid
 *   threshold must NEVER silently mark every row as "near home"; at `0` only a
 *   row exactly on the home point qualifies. (`Infinity` is deliberately NOT a
 *   match-everything escape hatch — a garbage preference collapses to `0`.)
 * - Rows whose coordinate accessor returns `null` (no/absent/corrupt coords —
 *   e.g. edilizia rows, geocoded separately) are excluded: an unknown position
 *   cannot be asserted to be within any radius.
 */

/** Clamp a caller-supplied radius to a finite, non-negative metre value. */
export function sanitizeRadiusMeters(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) return 0;
  return radiusMeters;
}

/** True when `point` lies within `radiusMeters` of `home` (inclusive). */
export function isWithinRadius(home: Coords, point: Coords, radiusMeters: number): boolean {
  return haversineMeters(home, point) <= sanitizeRadiusMeters(radiusMeters);
}

/**
 * Keep the items whose coordinate is within `radiusMeters` of `home`, preserving
 * input order. `getCoord` maps an item to its `Coords` or `null`; `null`-coord
 * items are dropped (see module doc).
 */
export function filterWithinRadius<T>(
  home: Coords,
  radiusMeters: number,
  items: readonly T[],
  getCoord: (item: T) => Coords | null
): T[] {
  const radius = sanitizeRadiusMeters(radiusMeters);
  return items.filter((item) => {
    const point = getCoord(item);
    if (point == null) return false;
    return haversineMeters(home, point) <= radius;
  });
}
