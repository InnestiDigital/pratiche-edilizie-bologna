import type { Coords } from './permit-extra';
import { geocodeCivico, type CiviciIndex } from './geocode-civici';

/**
 * Pure via-name → `codvia` resolver, the missing half of "set HOME by address".
 *
 * The home anchor is set today ONLY from a permit detail's "Imposta come casa" —
 * a first-time user whose real home has no nearby permit cannot set their actual
 * address. This module closes that gap on-device with NO external geocoder and NO
 * backend (the app's no-network invariant): the user types/picks a street, and we
 * resolve it to the `codvia` join key that `geocode-civici.ts` already turns into
 * a coordinate. It runs in Node, unit-tested, mirroring `quartiere-normalize.ts`
 * (case/whitespace canonicalization → exact map lookup, unknown → `null`).
 *
 * Layering: this is the DECISION half — street text → `codvia`. The device glue
 * that populates the {@link StreetIndex} entries (the distinct `via`+`codvia`
 * pairs already carried by local edilizia rows — see `normalize.ts`, every
 * edilizia row has both `address` and `codvia`) and wires the Settings picker is
 * the thin layer on top. Keeping the resolver pure means the brittle bit — street
 * normalization, embedded-civic stripping, the never-assert-a-wrong-street rule —
 * is verified without a device.
 *
 * Safety, as everywhere the app resolves a coordinate: an unmatched street yields
 * `null` (an unknown position is never asserted), never a nearest-guess — exactly
 * like `normalizeQuartiere` returning `null` for an unrecognised district rather
 * than a wrong one. The match is normalized-EXACT (no fuzzy nearest), so the
 * Settings picker — which feeds back a real list entry — always resolves, while a
 * mistyped free-text street safely fails instead of anchoring the wrong home.
 */

/** One street → code pair, as carried by a local edilizia row or the gazetteer. */
export interface StreetEntry {
  /** Street name as it appears in the source (e.g. "VIA MARCONI", "Via Marconi, 12"). */
  via: string;
  /** ODS street code — the join key {@link geocodeCivico} resolves to a coordinate. */
  codvia: number;
}

/**
 * A built lookup over the local street list. Opaque to callers — construct it
 * with {@link buildStreetIndex}, query it with {@link resolveStreetCode}, and
 * offer {@link StreetIndex.names} as the Settings picker's option list.
 */
export interface StreetIndex {
  /** Normalized street name → `codvia`. */
  readonly byName: ReadonlyMap<string, number>;
  /**
   * Sorted, de-duplicated display names (the first-seen spelling per normalized
   * key) — the option list for a "pick your street" UI. Sorted case-insensitively
   * so the picker reads alphabetically and the list is deterministic.
   */
  readonly names: readonly string[];
}

const TRAILING_CIVIC = /^\d+[a-z]?$/; // "12", "12a" — a house number, not part of the name.

/**
 * Fold the accented Latin vowels that appear in Italian street names to their
 * base letter (à→a, è/é→e, …). Explicit and ASCII-only — no `String.normalize`
 * / `\p{Diacritic}` (both are unreliable on the on-device Hermes engine); this
 * runs on device when the user types an address, so it must not depend on ICU.
 */
function foldAccents(s: string): string {
  return s
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n');
}

/**
 * Canonicalize a street name to a comparison key: lowercase, strip diacritics,
 * fold punctuation to spaces, collapse whitespace, and drop any TRAILING
 * house-number tokens ("Via Marconi, 12" and "VIA MARCONI" → the same key). Only
 * trailing numeric tokens are dropped, so a street whose name legitimately
 * contains a number ("Via del 2 Agosto") keeps it. Returns `''` for input that
 * canonicalizes to nothing (empty / punctuation-only / a bare civic number).
 */
export function normalizeStreetName(raw: string): string {
  const tokens = foldAccents(raw.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ') // fold punctuation (comma, apostrophe, slash, …) to space
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '');

  // Peel trailing house-number tokens off the end (e.g. "… marconi 12").
  while (tokens.length > 0 && TRAILING_CIVIC.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(' ');
}

/**
 * Build a {@link StreetIndex} from raw street entries. An entry with a non-finite
 * / negative / non-integer `codvia`, or a name that canonicalizes to `''`, is
 * dropped. On a duplicate normalized name the FIRST entry wins (deterministic —
 * a later noisy duplicate cannot clobber an earlier code), and its original
 * spelling is the one shown in {@link StreetIndex.names}.
 */
export function buildStreetIndex(entries: readonly StreetEntry[]): StreetIndex {
  const byName = new Map<string, number>();
  const displayByKey = new Map<string, string>();

  for (const { via, codvia } of entries) {
    if (!Number.isInteger(codvia) || codvia < 0) continue;
    if (typeof via !== 'string') continue;
    const key = normalizeStreetName(via);
    if (key === '') continue;
    if (byName.has(key)) continue; // first spelling + first code win
    byName.set(key, codvia);
    displayByKey.set(key, via.trim());
  }

  const names = [...displayByKey.values()].sort((a, b) =>
    a.localeCompare(b, 'it', { sensitivity: 'base' })
  );

  return { byName, names };
}

/**
 * Resolve a typed/picked street to its `codvia`, or `null` when the street is
 * unknown (or the input canonicalizes to nothing). Normalized-EXACT — never a
 * nearest-guess — so an unrecognised street fails safely rather than anchoring
 * the wrong home.
 */
export function resolveStreetCode(
  index: StreetIndex,
  via: string | null | undefined
): number | null {
  if (via == null) return null;
  const key = normalizeStreetName(via);
  if (key === '') return null;
  return index.byName.get(key) ?? null;
}

/**
 * Resolve a typed address (street + optional house number) to a coordinate:
 * street → `codvia` via {@link resolveStreetCode}, then `codvia`+`civico` →
 * coordinate via the already-tested {@link geocodeCivico}. Returns `null` when
 * the street is unknown; an unmatched/absent `civico` falls back to the street
 * centroid inside `geocodeCivico` (street-level, approximate) — never a wrong
 * point. This is the single call the Settings "Imposta indirizzo" flow makes.
 */
export function resolveAddressCoord(
  streetIndex: StreetIndex,
  civiciIndex: CiviciIndex,
  via: string | null | undefined,
  civico: number | null | undefined
): Coords | null {
  const codvia = resolveStreetCode(streetIndex, via);
  if (codvia == null) return null;
  return geocodeCivico(civiciIndex, codvia, civico);
}
