import { describe, it, expect } from 'vitest';
import { formatSearchTerm } from './search-empty-message';

describe('formatSearchTerm', () => {
  it('returns null for an empty string', () => {
    expect(formatSearchTerm('')).toBeNull();
  });

  it('returns null for a whitespace-only query', () => {
    expect(formatSearchTerm('   ')).toBeNull();
    expect(formatSearchTerm('\t\n ')).toBeNull();
  });

  it('passes a normal term through unchanged', () => {
    expect(formatSearchTerm('Via Marconi')).toBe('Via Marconi');
  });

  it('trims leading and trailing whitespace', () => {
    expect(formatSearchTerm('  Via Zamboni  ')).toBe('Via Zamboni');
  });

  it('collapses internal runs of whitespace to a single space', () => {
    expect(formatSearchTerm('Via    Roma\t\t12')).toBe('Via Roma 12');
  });

  it('keeps a term exactly at the max length intact', () => {
    const term = 'a'.repeat(32);
    expect(formatSearchTerm(term, 32)).toBe(term);
  });

  it('truncates a term longer than the max length with an ellipsis', () => {
    const result = formatSearchTerm('a'.repeat(40), 10);
    expect(result).toBe('aaaaaaaaa…');
    expect(result).toHaveLength(10);
  });

  it('does not leave a dangling space before the ellipsis when truncating mid-gap', () => {
    // "abcdefgh " would be the naive 9-char slice; the trailing space is trimmed.
    expect(formatSearchTerm('abcdefgh ijklmnop', 10)).toBe('abcdefgh…');
  });
});
