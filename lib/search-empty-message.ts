/**
 * Formats a raw feed search query for display inside the "no results" empty
 * state, where the term is echoed back to the user (`Nessun risultato per «…»`).
 *
 * - Collapses internal runs of whitespace to a single space and trims the ends,
 *   so a query the user padded or double-spaced reads cleanly when quoted.
 * - Truncates overly long terms with an ellipsis (keeping `maxLength` visible
 *   characters) so an echoed query can never blow out the empty-state card.
 * - Returns `null` when the query is empty or whitespace-only: no search is
 *   active, so the caller must fall back to the generic filter empty-state
 *   instead of quoting an empty string.
 *
 * Pure + deterministic (no clock, no I/O) so it is unit-tested without a device.
 */
export function formatSearchTerm(raw: string, maxLength = 32): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return null;
  if (collapsed.length <= maxLength) return collapsed;
  // Reserve one slot for the ellipsis; trim a dangling space so we never quote
  // "foo …" with a gap before the ellipsis.
  return collapsed.slice(0, maxLength - 1).trimEnd() + '…';
}
