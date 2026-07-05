import { QUARTIERI, type Quartiere } from './constants';

/**
 * Canonicalize a quartiere string so ODS spellings match the {@link QUARTIERI}
 * enum. The building-permit datasets never expose a quartiere name (edilizia
 * derives its zone from a `codvia` code map), but the newer civic sources do —
 * and they spell the hyphenated districts with spaces around the hyphen
 * ('San Donato - San Vitale', 'Porto - Saragozza') while `QUARTIERI` uses the
 * tight form ('San Donato-San Vitale', 'Porto-Saragozza').
 *
 * The match is case-insensitive and collapses whitespace (including around the
 * hyphen) so both spellings land on the same key. Unknown or null input returns
 * `null` — the same "no zone" value edilizia uses. A NULL-zone row appears in the
 * default all-quartieri feed (the zone predicate is omitted when no quartiere is
 * deselected — see `buildFeedWhere`) but is hidden once the user narrows to
 * specific quartieri: an unrecognised district carries no zone rather than a
 * wrong one.
 */

/** Collapse case + whitespace (incl. around hyphens) to a comparable key. */
function canonicalKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*/g, '-') // "san donato - san vitale" → "san donato-san vitale"
    .replace(/\s+/g, ' '); // any remaining internal whitespace runs → single space
}

const CANONICAL_BY_KEY = new Map<string, Quartiere>(QUARTIERI.map((q) => [canonicalKey(q), q]));

export function normalizeQuartiere(raw: string | null | undefined): Quartiere | null {
  if (raw == null) return null;
  return CANONICAL_BY_KEY.get(canonicalKey(raw)) ?? null;
}
