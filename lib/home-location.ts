import type { Coords } from './permit-extra';
import { filterWithinRadius } from './geo-radius';

/**
 * Pure core for the P4 "Vicino a casa" feature (docs/P4-map-radius.md §5 — the
 * feed-wide radius filter, the first geo value that isn't per-detail): the user
 * anchors a home coordinate (set from a permit they know on the map), then the
 * feed can be narrowed to civic activity within a chosen radius of that home.
 *
 * Everything decidable lives here — the stored-pref shape, its hardened decode,
 * the radius vocabulary, the "is the filter effective" decision, and the actual
 * proximity cut (delegated to the already-tested `geo-radius` haversine core).
 * The device-coupled halves (the Settings/detail UI, reading `extra.lat/lon`)
 * stay thin and delegate here, mirroring how the rest of `lib/` was built.
 *
 * Safety is load-bearing: the home coordinate comes from on-device storage, so
 * {@link parseStoredHome} re-validates it (finite, in WGS84 range, real label)
 * exactly like `permit-extra.ts::getCoords` does at the read boundary — a
 * corrupt/legacy stored home decodes to `null` (feature simply off), never to a
 * bogus point that would silently filter the feed to nothing or everything.
 */

/** The user's home anchor: a validated coordinate + a human label to show it by. */
export interface HomeLocation {
  coords: Coords;
  /** Display label (the address/title of the permit it was anchored from). */
  label: string;
}

/** The radius choices offered in Settings, in metres. */
export const HOME_RADIUS_OPTIONS = [300, 500, 1000, 2000] as const;

/** Default radius for a freshly-set home — a walkable neighbourhood scale. */
export const DEFAULT_HOME_RADIUS_M = 500;

/** WGS84-range + finite guard for a single decoded degree value. */
function isUsableDegree(v: unknown, maxAbs: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= maxAbs;
}

/**
 * Serialize a home for the `preferences` store. `null` (no home / cleared) round-
 * trips through the literal string `'null'`, which {@link parseStoredHome} maps
 * straight back to `null`.
 */
export function serializeHome(home: HomeLocation | null): string {
  if (home === null) return 'null';
  return JSON.stringify({ lat: home.coords.lat, lon: home.coords.lon, label: home.label });
}

/**
 * Decode a stored home string into a {@link HomeLocation}, or `null` when it is
 * absent / cleared / corrupt. Every failure mode (bad JSON, wrong shape, non-
 * finite or out-of-range coordinate, non-string label) collapses to `null` so a
 * garbage pref can never anchor the feed filter to a bogus point.
 */
export function parseStoredHome(raw: string): HomeLocation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { lat, lon, label } = parsed as Record<string, unknown>;
  if (!isUsableDegree(lat, 90) || !isUsableDegree(lon, 180)) return null;
  const safeLabel = typeof label === 'string' && label.trim() !== '' ? label : 'Posizione';
  return { coords: { lat, lon }, label: safeLabel };
}

/**
 * Snap an arbitrary stored radius to a valid option. An exact option passes
 * through; anything else (junk, a legacy value, a removed option) resolves to
 * the nearest offered radius — never NaN/negative, so the filter always has a
 * meaningful threshold. Ties break toward the smaller (tighter) radius.
 */
export function sanitizeHomeRadius(meters: number): number {
  if (!Number.isFinite(meters)) return DEFAULT_HOME_RADIUS_M;
  let best = HOME_RADIUS_OPTIONS[0] as number;
  let bestDiff = Math.abs(meters - best);
  for (const opt of HOME_RADIUS_OPTIONS) {
    const diff = Math.abs(meters - opt);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}

/** Human radius label: "300 m", "1 km", "1,5 km" (Italian decimal comma). */
export function formatRadiusLabel(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1).replace('.', ',')} km`;
}

/**
 * True when the "Vicino a casa" filter should actually apply: the user enabled
 * it AND a home is set. A toggle with no home set is inert (the feed does not
 * offer the toggle until a home exists), so this is the single guard the feed
 * checks before switching to radius-scan mode.
 */
export function homeFilterActive(home: HomeLocation | null, enabled: boolean): boolean {
  return enabled && home !== null;
}

/**
 * Keep the items whose coordinate is within `radiusMeters` of the home, input
 * order preserved. Delegates to the tested `filterWithinRadius`; items whose
 * coordinate accessor returns `null` (no/absent coord — e.g. a not-yet-geocoded
 * edilizia row) are dropped, since an unknown position can't be asserted near.
 */
export function filterPermitsNearHome<T>(
  home: HomeLocation,
  radiusMeters: number,
  items: readonly T[],
  getCoord: (item: T) => Coords | null
): T[] {
  return filterWithinRadius(home.coords, radiusMeters, items, getCoord);
}

/**
 * Whether two coordinates denote the same anchor, within a ~1 m epsilon (5
 * decimal degrees). Lets a permit detail tell if THIS permit is already the set
 * home without depending on exact float equality of restored/stored values.
 */
export function isSameLocation(a: Coords | null, b: Coords | null): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;
}
