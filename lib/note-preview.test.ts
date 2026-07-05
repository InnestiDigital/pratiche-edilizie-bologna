import { describe, it, expect } from 'vitest';
import { notePreview, NOTE_PREVIEW_MAX } from './note-preview';

describe('notePreview', () => {
  it('returns a short single-line note unchanged', () => {
    expect(notePreview('Richiamare dopo il 15')).toBe('Richiamare dopo il 15');
  });

  it('collapses newlines and whitespace runs to single spaces', () => {
    expect(notePreview('Ho chiamato\nlo Sportello.\n\n  Richiamare.')).toBe(
      'Ho chiamato lo Sportello. Richiamare.'
    );
  });

  it('trims leading/trailing whitespace', () => {
    expect(notePreview('   nota   ')).toBe('nota');
  });

  it('ellipsizes a long note past the budget at a word boundary', () => {
    const long =
      'La pratica e in attesa del parere della Soprintendenza per i vincoli storici del centro';
    const out = notePreview(long);
    const body = out.slice(0, -1); // drop the ellipsis
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(NOTE_PREVIEW_MAX + 1);
    // the body is a whole prefix of the original, cut exactly at a word boundary
    // (the next original char is a space → no word was split)
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length]).toBe(' ');
  });

  it('does not add an ellipsis when the note exactly fits the budget', () => {
    const exact = 'a'.repeat(NOTE_PREVIEW_MAX);
    expect(notePreview(exact)).toBe(exact);
  });

  it('hard-cuts a single word with no spaces to break on', () => {
    const wordy = 'x'.repeat(NOTE_PREVIEW_MAX + 20);
    const out = notePreview(wordy);
    expect(out).toBe('x'.repeat(NOTE_PREVIEW_MAX) + '…');
  });

  it('honours a custom max', () => {
    expect(notePreview('uno due tre quattro', 7)).toBe('uno due…');
  });

  it('falls back to the default budget for a non-positive or non-finite max', () => {
    const long = 'parola '.repeat(30).trim();
    for (const bad of [0, -5, NaN, Infinity]) {
      const out = notePreview(long, bad);
      expect(out.length).toBeLessThanOrEqual(NOTE_PREVIEW_MAX + 1);
    }
  });

  it('returns an empty string for blank/whitespace input (never crashes a render)', () => {
    expect(notePreview('')).toBe('');
    expect(notePreview('   \n  ')).toBe('');
  });
});
