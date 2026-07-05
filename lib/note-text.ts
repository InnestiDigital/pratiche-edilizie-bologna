/**
 * Pure normalization for a user's **personal note** on a permit.
 *
 * A note is free text a resident jots against a permit they are tracking ("ho
 * chiamato l'ufficio, richiamano lunedì"). Persistence lives in `notes.ts`
 * (SQLite); this module owns the one decision that must be deterministic and
 * unit-tested: turning the raw text of an editor into either the value to store
 * or `null` meaning "no note" (which the caller stores as a delete).
 *
 * Rules, in order:
 *  - Normalize newlines to `\n` (a web/native editor can emit `\r\n`), so the
 *    stored form is stable across platforms.
 *  - Trim leading/trailing whitespace (incl. blank lines) — a note that is only
 *    spaces/newlines is "empty".
 *  - Empty after trimming → `null` (delete the note).
 *  - Otherwise cap the length to `NOTE_MAX_LENGTH` characters so a runaway paste
 *    can't bloat the row, then trim again (a cut at the boundary can leave
 *    trailing whitespace).
 */

/** Hard cap on a stored note, in characters. */
export const NOTE_MAX_LENGTH = 2000;

/**
 * Clean raw editor text into the value to store, or `null` when the note is
 * effectively empty (the caller deletes the row in that case). Deterministic and
 * side-effect-free.
 */
export function normalizeNote(raw: string): string | null {
  const unified = raw.replace(/\r\n?/g, '\n');
  const trimmed = unified.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= NOTE_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, NOTE_MAX_LENGTH).trim();
}
