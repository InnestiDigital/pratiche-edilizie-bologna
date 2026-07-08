import type { Coords } from './permit-extra';

/**
 * Pure on-device geocoder over the Bologna "Numeri civici" gazetteer
 * (`rifter_civici_pt`, docs/P4-map-radius.md §3): given a street code `codvia`
 * and a house number `civico`, resolve a WGS84 coordinate with NO external
 * geocoding service and NO native dependency — it runs in Node, unit-tested,
 * mirroring `geo-distance.ts` / `geo-radius.ts` / `nearby-permits.ts`.
 *
 * This is the vitest gate for P4 slice 3 (docs/P4-map-radius.md §5). It is the
 * testable HALF of the slice: the caller that streams the ~77 600-row gazetteer
 * into a local SQLite `civici` table (a one-time paged fetch, mirroring the sync
 * table pattern) and then walks the coordinate-less edilizia rows to back-fill
 * their `extra.lat/lon` is the device-coupled glue built on top of this core.
 * Keeping the lookup pure means the brittle bit — key normalization, the
 * street-level fallback, junk rejection — is verified without a device or a build.
 *
 * Two documented uses (docs/P4-map-radius.md §3), one code path:
 *   1. Back-fill the coordinate-less EDILIZIA rows from their `codvia`+`civico`.
 *   2. Geocode the user's home once it has been resolved to a `codvia`+`civico`.
 *
 * Safety is load-bearing (coordinates come from a downloaded dataset): a record
 * with a non-finite key or an out-of-range / non-finite coordinate is dropped at
 * index-build time, so it can neither answer an exact query nor skew a street
 * centroid. An unknown street resolves to `null` — an unknown position is never
 * asserted.
 */

/** One civic-number point from the gazetteer, already parsed to numbers. */
export interface CiviciRecord {
  /** ODS street code — the join key edilizia shares with the gazetteer. */
  codvia: number;
  /** House number. */
  civico: number;
  lat: number;
  lon: number;
}

/**
 * A built lookup over the gazetteer. Opaque to callers — construct it with
 * {@link buildCiviciIndex} and query it with {@link geocodeCivico}.
 */
export interface CiviciIndex {
  /** Exact `codvia:civico` → coordinate. */
  readonly byCivico: ReadonlyMap<string, Coords>;
  /**
   * `codvia` → mean coordinate of all that street's civic points: the street-
   * level fallback when the exact civic number is missing or unmatched. A single-
   * point street collapses to that point; it is an approximation, never precise.
   */
  readonly streetCentroid: ReadonlyMap<number, Coords>;
}

/** WGS84-range + finite guard shared by the record filter. */
function isUsableCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

function civicoKey(codvia: number, civico: number): string {
  return `${codvia}:${civico}`;
}

/**
 * Build a {@link CiviciIndex} from raw gazetteer records. Records with a non-
 * finite `codvia`/`civico` or an unusable coordinate are dropped. On a duplicate
 * `codvia:civico` the FIRST record wins (deterministic — a later noisy duplicate
 * cannot clobber an earlier point), but every valid point still feeds its street
 * centroid.
 */
export function buildCiviciIndex(records: readonly CiviciRecord[]): CiviciIndex {
  const byCivico = new Map<string, Coords>();
  // Accumulate per-street sums to average into a centroid once, at the end.
  const acc = new Map<number, { sumLat: number; sumLon: number; count: number }>();

  for (const r of records) {
    if (!Number.isFinite(r.codvia) || !Number.isFinite(r.civico)) continue;
    if (!isUsableCoord(r.lat, r.lon)) continue;

    const key = civicoKey(r.codvia, r.civico);
    if (!byCivico.has(key)) byCivico.set(key, { lat: r.lat, lon: r.lon });

    const a = acc.get(r.codvia);
    if (a) {
      a.sumLat += r.lat;
      a.sumLon += r.lon;
      a.count += 1;
    } else {
      acc.set(r.codvia, { sumLat: r.lat, sumLon: r.lon, count: 1 });
    }
  }

  const streetCentroid = new Map<number, Coords>();
  for (const [codvia, a] of acc) {
    streetCentroid.set(codvia, { lat: a.sumLat / a.count, lon: a.sumLon / a.count });
  }

  return { byCivico, streetCentroid };
}

/**
 * Resolve a coordinate for a `codvia`(+`civico`) against the index:
 *
 *   1. exact `codvia:civico` hit → its coordinate;
 *   2. else, if the street is known → its centroid (approximate, street-level);
 *   3. else → `null`.
 *
 * `codvia` is required (a `null`/non-finite street code yields `null`); `civico`
 * is optional — a `null`/non-finite house number skips step 1 and goes straight
 * to the street centroid, which is exactly the right behaviour for an edilizia
 * row that has a street but no civic number.
 */
export function geocodeCivico(
  index: CiviciIndex,
  codvia: number | null | undefined,
  civico: number | null | undefined
): Coords | null {
  if (codvia == null || !Number.isFinite(codvia)) return null;

  if (civico != null && Number.isFinite(civico)) {
    const exact = index.byCivico.get(civicoKey(codvia, civico));
    if (exact) return exact;
  }

  return index.streetCentroid.get(codvia) ?? null;
}
