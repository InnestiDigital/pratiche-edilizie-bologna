import type { HomeLocation } from './home-location';

/**
 * Pure Settings-side glue for the "Imposta indirizzo" home flow — the second way
 * to set the "Vicino a casa" anchor (the first is a permit detail's "Imposta come
 * casa"). A first-time user whose real home has no nearby permit can type/pick
 * their street + civic number here instead of hunting for a permit on the map.
 *
 * This module owns only the DECIDABLE, device-free parts: parsing the civic-number
 * input, cleaning a raw address into a picker display name, building the human
 * label, and the discriminated result the UI branches on. The async orchestration
 * (resolve street → live gazetteer fetch → geocode) lives in `home-geocode.ts`,
 * and the sole device-gated seam — the live `rifter_civici_pt` fetch — is injected
 * there, so everything brittle is unit-tested without a device.
 *
 * Safety mirrors the rest of the geo stack: an unknown street or an unresolvable
 * coordinate yields an explicit non-`ok` result, never a nearest-guess or a bogus
 * anchor — the "Vicino a casa" filter must never silently point at the wrong home.
 */

/**
 * Outcome of resolving a typed/picked address to a home anchor. Every failure is
 * an explicit, distinct variant so the UI can say precisely why nothing was set —
 * never a silent no-op or a wrong pin.
 */
export type HomeAddressResolution =
  | { readonly kind: 'ok'; readonly home: HomeLocation }
  /** No streets known locally yet — the user must sync their zone first. */
  | { readonly kind: 'empty-index' }
  /** The street is not in the local index (e.g. free text that didn't match). */
  | { readonly kind: 'unknown-street' }
  /** Street known, but the gazetteer held no point for it — cannot place a pin. */
  | { readonly kind: 'no-coordinate' }
  /** The live gazetteer fetch failed (offline / transport error). */
  | { readonly kind: 'fetch-failed' };

/** A trailing house-number token on a raw address ("… 24", "… 24a", "… 24/A"). */
const TRAILING_CIVIC = /[\s,]+\d+\s*[a-z]?(?:\/\s*[0-9a-z]+)?\s*$/i;

/**
 * Parse the civic-number text field to a positive integer, or `null` when it is
 * empty / non-numeric / non-positive. `null` is a valid input — it resolves the
 * home at street level (the gazetteer street centroid) rather than a precise civic
 * point, exactly like an edilizia row that carries a street but no civic number.
 * A leading-digit parse tolerates suffixes ("12a" → 12); junk ("abc", "-3", "0")
 * yields `null` so a bad field degrades to street-level, never to a wrong number.
 */
export function parseCivicoInput(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Strip a trailing house number off a raw address so the street picker shows a
 * clean street name ("Via Marconi 24" → "Via Marconi"). Only a trailing numeric
 * token is removed, so a name that legitimately ends elsewhere ("Via del 2
 * Agosto") is untouched; if stripping would empty the string, the trimmed
 * original is kept. The result is a DISPLAY name — resolution re-normalizes it.
 */
export function streetDisplayName(address: string): string {
  const stripped = address.replace(TRAILING_CIVIC, '').trim();
  return stripped === '' ? address.trim() : stripped;
}

/**
 * Build the home label shown in Settings: the (already display-clean) street name,
 * with the civic number appended when one was given ("Via Marconi 12"), or the
 * bare street when it resolved at street level ("Via Marconi").
 */
export function formatHomeAddressLabel(via: string, civico: number | null): string {
  const street = via.trim();
  return civico != null ? `${street} ${civico}` : street;
}
