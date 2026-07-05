import { describe, it, expect } from 'vitest';
import { normalizeNote, NOTE_MAX_LENGTH } from './note-text';

describe('normalizeNote', () => {
  it('returns trimmed text for a normal note', () => {
    expect(normalizeNote('  Ho chiamato l’ufficio  ')).toBe('Ho chiamato l’ufficio');
  });

  it('preserves interior newlines but trims the ends', () => {
    expect(normalizeNote('\n\nprima riga\nseconda riga\n\n')).toBe('prima riga\nseconda riga');
  });

  it('normalizes CRLF and lone CR to \\n', () => {
    expect(normalizeNote('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('returns null for an empty string', () => {
    expect(normalizeNote('')).toBeNull();
  });

  it('returns null for whitespace / blank-line-only input', () => {
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote('\n\n\t \r\n')).toBeNull();
  });

  it('keeps a note exactly at the length cap intact', () => {
    const exact = 'x'.repeat(NOTE_MAX_LENGTH);
    expect(normalizeNote(exact)).toBe(exact);
  });

  it('caps an over-long note to NOTE_MAX_LENGTH characters', () => {
    const long = 'y'.repeat(NOTE_MAX_LENGTH + 500);
    const result = normalizeNote(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(NOTE_MAX_LENGTH);
  });

  it('re-trims after capping so no trailing whitespace survives the cut', () => {
    // A run of non-space text followed by spaces, cut exactly at the boundary
    // between them, must not leave a trailing space.
    const head = 'z'.repeat(NOTE_MAX_LENGTH - 1);
    const raw = `${head}   trailing`;
    const result = normalizeNote(raw);
    expect(result).toBe(head);
    expect(result!.endsWith(' ')).toBe(false);
  });
});
