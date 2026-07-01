/**
 * Pure decoders for preference values read from persistent storage.
 *
 * Kept free of any expo/react-native (db) import so the logic is unit-testable
 * in a plain Node environment and reusable at the storage boundary.
 */

/**
 * Safely decode a JSON-encoded string array read from persistent storage.
 * Stored preferences are an untrusted boundary: a corrupt or legacy value must
 * never crash preference loading (a raw `JSON.parse` throws on malformed input).
 * On any parse failure or non-array shape, fall back to `fallback`; on a valid
 * array, keep only its string entries. A valid empty array is preserved as-is.
 */
export function decodeStringArray(raw: string, fallback: readonly string[]): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...fallback];
  }
  if (!Array.isArray(parsed)) return [...fallback];
  return parsed.filter((v): v is string => typeof v === 'string');
}

/**
 * Decode a JSON-encoded array of domain-enum values (zones, filing types).
 * Beyond {@link decodeStringArray}, drop any value not in `allowed` so a renamed
 * or removed constant degrades to "no filter" rather than querying a dead value.
 */
export function decodeEnumArray<T extends string>(
  raw: string,
  allowed: readonly T[],
  fallback: readonly T[]
): T[] {
  const allowedSet = new Set<string>(allowed);
  return decodeStringArray(raw, fallback).filter((v): v is T => allowedSet.has(v));
}
