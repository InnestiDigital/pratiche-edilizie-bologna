import { STATUS_LABELS } from './constants';

/** Canonical status keys — the outcomes a permit can carry (see `STATUS_LABELS`). */
const STATUS_KEYS = Object.keys(STATUS_LABELS);

/**
 * Validate a `status` route param (from the Sync "Per Stato" deep link) into a
 * known status key, or `null` when it is missing / malformed / not one of the
 * canonical outcomes.
 *
 * Mirrors `parseZoneParam` / `parseTagParam`: expo-router hands a param as
 * `string | string[] | undefined` (a repeated key or array pathname yields the
 * array form), so we normalize the array to its first element, trim it, and check
 * it against the canonical `STATUS_LABELS` keys. Anything that is not an exact
 * match — junk, a human label instead of the key, an empty string — returns
 * `null` so the feed silently ignores it rather than filtering to an impossible
 * status.
 */
export function parseStatusParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return STATUS_KEYS.includes(trimmed) ? trimmed : null;
}
