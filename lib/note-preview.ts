/**
 * Pure one-line preview of a personal note, shown on the feed card so a resident
 * can see WHAT they wrote on a permit they're tracking — not just that a note
 * exists — without opening the detail.
 *
 * A stored note (see `notes.ts`) is multi-line free text: `normalizeNote` keeps
 * the user's `\n` line breaks. For a single-line card caption those breaks (and
 * any run of whitespace) collapse to a single space; the result is trimmed and
 * ellipsized past `NOTE_PREVIEW_MAX`, backing off to the last word boundary so a
 * word is not cut mid-way.
 *
 * Total and never-throwing: an emptied note is deleted rather than stored, so a
 * real preview is always non-empty, but a blank/whitespace input returns `''`
 * (the card then renders no strip) so a malformed fixture/row can't crash a
 * render. Kept free of native imports so it runs in vitest and the web export.
 */

/** Max characters of note text shown in the one-line feed-card preview. */
export const NOTE_PREVIEW_MAX = 80;

/**
 * Collapse a stored note to a single trimmed line, ellipsized past `max`.
 *
 * @param note the stored (already-normalized) note text
 * @param max  character budget; sanitized to a positive int, else `NOTE_PREVIEW_MAX`
 */
export function notePreview(note: string, max: number = NOTE_PREVIEW_MAX): string {
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : NOTE_PREVIEW_MAX;
  const collapsed = note.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= cap) return collapsed;

  // Cut to the budget, then back off to the last space so a word is not split —
  // but only if that space is not so early it would drop most of the budget.
  const cut = collapsed.slice(0, cap);
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > cap * 0.6 ? cut.slice(0, lastSpace) : cut;
  return body.trimEnd() + '…';
}
