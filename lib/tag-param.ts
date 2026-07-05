import { TAG_LABELS } from './constants';

/** Canonical tag keys — the topic labels a permit can carry (see `TAG_LABELS`). */
const TAG_KEYS = Object.keys(TAG_LABELS);

/**
 * Validate a `tag` route param (from a permit detail's "tap an etichetta" deep
 * link) into a known tag key, or `null` when it is missing / malformed / not one
 * of the canonical topic tags.
 *
 * Mirrors `parseZoneParam`: expo-router hands a param as `string | string[] |
 * undefined` (a repeated key or array pathname yields the array form), so we
 * normalize the array to its first element, trim it, and check it against the
 * canonical `TAG_LABELS` keys. Anything that is not an exact match — junk, a
 * human label instead of the key, an empty string — returns `null` so the feed
 * silently ignores it rather than filtering to an impossible tag.
 */
export function parseTagParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TAG_KEYS.includes(trimmed) ? trimmed : null;
}
