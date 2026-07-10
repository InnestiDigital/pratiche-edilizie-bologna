import type { Coords } from './permit-extra';
import { haversineMeters, formatApproxDistance } from './geo-distance';
import { sanitizeRadiusMeters } from './geo-radius';

/**
 * Pure ranking core for the permit-detail "Nei dintorni" proximity card
 * (docs/P4-map-radius.md §5 — the FIRST user-visible payoff of the P4 geo work):
 * given the coordinate of the permit being viewed, list the OTHER local permits
 * that sit within a radius, nearest first. This surfaces the cross-street
 * neighbour the two existing detail cards miss — "Nella stessa zona" is quartiere-
 * coarse and "Altre pratiche in <via>" is exact-street-only, so a cantiere 80 m
 * away on the parallel street shows up in neither.
 *
 * Library-agnostic (no `expo-sqlite`, no native imports) so it unit-tests in Node,
 * mirroring `geo-radius.ts`. It consumes the same `extra.lat/lon` those libs do,
 * read via `permit-extra.ts::getCoords`, so no native map dependency is needed.
 *
 * COVERAGE LIMIT (honest, per docs/P4-map-radius.md §0.2): edilizia rows carry NO
 * coordinates — they are geocoded from `codvia`+`civico` in a later slice — so
 * this card renders only for the four geo-dotted categories (cantieri / commercio
 * / eventi / segnalazioni) and finds only geo-dotted neighbours. When the edilizia
 * geocode lands, the SAME card widens automatically with no change here. It does
 * NOT yet represent full coverage; callers must not present it as such.
 *
 * Safety is load-bearing (the radius may come from a preference, the coordinate
 * from on-device storage): a non-finite/negative radius collapses to `0` (via
 * `sanitizeRadiusMeters` — never a match-everything escape hatch), a non-finite/
 * out-of-range `limit` falls back to the default, `null`-coord candidates are
 * excluded (an unknown position cannot be asserted near anything), and the
 * `originId` candidate is excluded so a permit never lists itself.
 */

/** Default radius for the proximity card, in metres. */
export const NEARBY_DEFAULT_RADIUS_M = 500;

/** Default max number of neighbours listed on the card. */
export const NEARBY_LIMIT = 4;

/** A candidate paired with its great-circle distance from the origin, in metres. */
export interface NearbyResult<T> {
  item: T;
  meters: number;
}

/**
 * Rank `items` by distance from `origin`, keeping those within `radiusMeters`
 * (default {@link NEARBY_DEFAULT_RADIUS_M}), nearest first, capped at `limit`
 * (default {@link NEARBY_LIMIT}).
 *
 * - The candidate whose id equals `originId` is excluded (self never appears).
 * - A candidate whose `getCoord` returns `null` is excluded (unknown position).
 * - Ties on distance break by `getId` ascending, so ordering is deterministic.
 */
export function rankNearby<T>(
  origin: Coords,
  originId: number,
  items: readonly T[],
  getId: (item: T) => number,
  getCoord: (item: T) => Coords | null,
  radiusMeters: number = NEARBY_DEFAULT_RADIUS_M,
  limit: number = NEARBY_LIMIT
): NearbyResult<T>[] {
  const radius = sanitizeRadiusMeters(radiusMeters);
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : NEARBY_LIMIT;

  const scored: { item: T; id: number; meters: number }[] = [];
  for (const item of items) {
    const id = getId(item);
    if (id === originId) continue;
    const point = getCoord(item);
    if (point == null) continue;
    const meters = haversineMeters(origin, point);
    if (meters <= radius) scored.push({ item, id, meters });
  }

  scored.sort((a, b) => (a.meters !== b.meters ? a.meters - b.meters : a.id - b.id));
  return scored.slice(0, safeLimit).map(({ item, meters }) => ({ item, meters }));
}

/**
 * Format a metre distance as the "Nei dintorni" row label. A thin intent-named
 * wrapper over the shared {@link formatApproxDistance} so this card and the feed's
 * "da casa" chip render one identical distance format (single source of truth —
 * see `geo-distance.ts::formatApproxDistance`).
 */
export function formatNearbyDistance(meters: number): string {
  return formatApproxDistance(meters);
}
