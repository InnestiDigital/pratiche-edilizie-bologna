import { QUARTIERI, type Quartiere } from './constants';

/**
 * Validate a `zone` route param (from the Sync "Per Quartiere" deep link) into a
 * known `Quartiere`, or `null` when it is missing / malformed / not one of the six
 * Bologna quartieri.
 *
 * expo-router hands a param as `string | string[] | undefined` (a repeated key or
 * an array pathname yields the array form), so we normalize the array to its first
 * element, trim it, and check it against the canonical `QUARTIERI` list. Anything
 * that is not an exact match — junk, a legacy zone name, an empty string — returns
 * `null` so the feed silently ignores it rather than filtering to nothing.
 */
export function parseZoneParam(raw: string | string[] | undefined): Quartiere | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return (QUARTIERI as readonly string[]).includes(trimmed) ? (trimmed as Quartiere) : null;
}
