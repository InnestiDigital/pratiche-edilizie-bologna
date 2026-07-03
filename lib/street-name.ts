/**
 * Extract the street name from a Bologna civic address by stripping the trailing
 * civic-number portion, so the permit detail can offer a "other permits on this
 * street" search (a resident tracking their own street, narrower than the
 * zone-wide "Nella stessa zona" card).
 *
 * Pure + null-safe. Strips exactly ONE trailing civic token (plus an optional
 * lone-letter suffix like "24 A"), so a street name that itself ends in a number
 * — e.g. "Via 2 Agosto 1980" — keeps that number rather than being over-trimmed.
 *
 *   "Via Marconi 24"        → "Via Marconi"
 *   "Via Andrea Costa 140"  → "Via Andrea Costa"
 *   "Piazza Maggiore 6/A"   → "Piazza Maggiore"
 *   "Via Saragozza 12-14"   → "Via Saragozza"
 *   "Via Marconi 24 A"      → "Via Marconi"
 *   "Via Emilia Levante SNC" → "Via Emilia Levante"
 *   "Via 2 Agosto 1980 55"  → "Via 2 Agosto 1980"
 *
 * Returns null when nothing meaningful remains (empty / whitespace / only a
 * civic number) — the caller then omits the street action rather than showing a
 * blank or number-only "street".
 */
export function extractStreetName(address: string | null | undefined): string | null {
  if (!address) return null;

  const tokens = address
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const startsWithDigit = (t: string) => /^\d/.test(t);
  // A civic token: a number (optionally with a "/A" or "-range" suffix) or the
  // "senza numero civico" marker used when a building has no number.
  const isCivic = (t: string) => startsWithDigit(t) || /^s\.?n\.?c\.?$/i.test(t);
  const isLoneLetter = (t: string) => /^[a-z]$/i.test(t);

  // "Via Marconi 24 A" — the civic letter is split into its own token; drop it
  // only when an actual civic number precedes it, so a real one-letter street
  // word is never eaten.
  if (
    tokens.length >= 2 &&
    isLoneLetter(tokens[tokens.length - 1]) &&
    startsWithDigit(tokens[tokens.length - 2])
  ) {
    tokens.pop();
  }

  // Drop a single trailing civic token. Only one — see the "Via 2 Agosto 1980"
  // note above — and never the last remaining token (an address that is only a
  // number has no street to show).
  if (tokens.length >= 2 && isCivic(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  // Require at least one word that is not itself a civic number, so a number-only
  // address ("24", "24/A") yields null rather than a meaningless "street".
  const hasName = tokens.some((t) => !startsWithDigit(t));
  const street = tokens.join(' ').trim();
  return hasName && street.length > 0 ? street : null;
}
