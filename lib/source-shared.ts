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
