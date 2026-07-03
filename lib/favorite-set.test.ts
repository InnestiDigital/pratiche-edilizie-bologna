import { describe, it, expect } from 'vitest';
import { applyFavoriteToggle } from './favorite-set';

describe('applyFavoriteToggle', () => {
  it('adds the id when now saved', () => {
    const before = new Set(['a', 'b']);
    const after = applyFavoriteToggle(before, 'c', true);
    expect([...after].sort()).toEqual(['a', 'b', 'c']);
  });

  it('removes the id when no longer saved', () => {
    const before = new Set(['a', 'b', 'c']);
    const after = applyFavoriteToggle(before, 'b', false);
    expect([...after].sort()).toEqual(['a', 'c']);
  });

  it('adding an already-present id is idempotent', () => {
    const before = new Set(['a', 'b']);
    const after = applyFavoriteToggle(before, 'a', true);
    expect([...after].sort()).toEqual(['a', 'b']);
  });

  it('removing an absent id is a no-op on membership', () => {
    const before = new Set(['a', 'b']);
    const after = applyFavoriteToggle(before, 'z', false);
    expect([...after].sort()).toEqual(['a', 'b']);
  });

  it('returns a new set and never mutates the input', () => {
    const before = new Set(['a']);
    const after = applyFavoriteToggle(before, 'b', true);
    expect(after).not.toBe(before);
    expect([...before]).toEqual(['a']);
  });

  it('works from an empty set', () => {
    const after = applyFavoriteToggle(new Set<string>(), 'x', true);
    expect([...after]).toEqual(['x']);
  });
});
