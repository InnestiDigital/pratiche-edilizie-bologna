/**
 * Validate a `new` route param (from a "new permits" notification deep link)
 * into a boolean "activate the Solo nuovi filter" intent.
 *
 * Mirrors parseTagParam / parseZoneParam: expo-router hands a param as
 * `string | string[] | undefined` (a repeated key or array pathname yields the
 * array form), so we normalize the array to its first element and accept only
 * the canonical truthy token `'1'`. Anything else — missing, junk, '0', a stale
 * value — is `false`, so the feed is never silently narrowed to "Solo nuovi" by
 * a malformed or legacy link.
 */
export function parseNewParam(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1';
}
