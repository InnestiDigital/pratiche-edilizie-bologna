import { z } from 'zod';
import { SOURCES, type SourceKey } from './sources';

/**
 * Write-side helpers shared by the four non-edilizia source normalizers
 * (`source-cantieri.ts`, `source-commercio.ts`, `source-eventi.ts`,
 * `source-segnalazioni.ts`). Each of these was independently hand-rolling the
 * same three tiny operations — compacting an `extra` object, building the portal
 * table-search fallback link, and slicing an ODS date to `YYYY-MM-DD` — so with
 * four proven consumers they are consolidated here (CLAUDE.md's YAGNI bar).
 *
 * This is the WRITE side (normalize-time). The READ side (`permit-extra.ts`)
 * stays a separate, import-free storage-boundary decoder consumed by UI screens.
 * This module imports only `sources.ts` (a leaf), so it introduces no cycle.
 */

/**
 * `'' → null`: `??` only guards null/undefined, so an empty-string API value
 * (e.g. a blank `url`) must be normalized to `null` before any `??`-fallback
 * chain, else the empty string defeats the fallback and produces a dead link.
 */
export function nullIfEmpty(value: string | null | undefined): string | null {
  return value == null || value === '' ? null : value;
}

/**
 * Serialize a normalizer's `extra` fields to the stored JSON string, keeping only
 * entries whose value is a non-null, NON-EMPTY string (`''` from the API means
 * absent — see {@link nullIfEmpty}). Preserves the caller's key order via
 * `Object.entries`, which matters: `classifyUpsert` compares `extra` by string
 * equality, so the emitted JSON must be deterministic.
 */
export function compactExtra(fields: Record<string, string | null | undefined>): string {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value != null && value !== '') out[key] = value;
  }
  return JSON.stringify(out);
}

/**
 * Portal table-search fallback link for one source's record. The slug comes from
 * `SOURCES[key].slug` (single source of truth — no hardcoded dataset slugs), and
 * the query is always `encodeURIComponent`'d so an id with reserved characters
 * cannot break the URL.
 */
export function portalTableSearchLink(key: SourceKey, query: string): string {
  return `https://opendata.comune.bologna.it/explore/dataset/${SOURCES[key].slug}/table/?q=${encodeURIComponent(query)}`;
}

/** Normalize an ODS date/datetime string to plain `YYYY-MM-DD`; null/`''` → null. */
export function toIsoDate(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

/**
 * The ODS geo-point object, as every geo-capable Bologna source returns it: a
 * `{ lon, lat }` pair of numbers (cantieri `pinpoint`, commercio `geopoint`,
 * eventi `coordinate`, segnalazioni `geopoint` — verified live 2026-07-06). Any
 * unknown extra keys are stripped by the object schema. Wrap each row schema's
 * geo field with `optNull(geoPointSchema)` so an absent / null point validates
 * cleanly instead of failing the whole record at the ingress boundary.
 */
export const geoPointSchema = z.object({ lat: z.number(), lon: z.number() });
export type GeoPoint = z.output<typeof geoPointSchema>;

/**
 * Turn an optional ODS geo-point into the two `extra` string fields the on-device
 * decoder reads back (`permit-extra.ts::getCoords`). Coordinates are stored as
 * STRINGS so {@link compactExtra} keeps them (it drops non-string values) and the
 * serialized `extra` round-trips deterministically for change detection.
 *
 * A null point, or a non-finite / out-of-range coordinate (a swapped-axis or
 * garbage record), yields `null` fields — dropped by `compactExtra` — rather than
 * persisting a bogus pin: on the future map (docs/P4-map-radius.md) no coordinate
 * is safer than a wrong one. `z.number()` admits `NaN`, so the finite guard is
 * load-bearing, not redundant.
 */
export function coordsToExtra(geo: GeoPoint | null | undefined): {
  lat: string | null;
  lon: string | null;
} {
  if (
    geo == null ||
    !Number.isFinite(geo.lat) ||
    !Number.isFinite(geo.lon) ||
    Math.abs(geo.lat) > 90 ||
    Math.abs(geo.lon) > 180
  ) {
    return { lat: null, lon: null };
  }
  return { lat: String(geo.lat), lon: String(geo.lon) };
}
