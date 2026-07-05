import { describe, it, expect } from 'vitest';
import { applySeenToList } from './mark-seen';

type Row = { source_id: string; is_new: number; label?: string };

const row = (source_id: string, is_new: number, label?: string): Row => ({
  source_id,
  is_new,
  label,
});

describe('applySeenToList', () => {
  it('clears is_new for a loaded row no longer in the still-new set', () => {
    const list = [row('a', 1), row('b', 1)];
    const out = applySeenToList(list, new Set(['a']));
    expect(out.find((r) => r.source_id === 'a')?.is_new).toBe(1);
    expect(out.find((r) => r.source_id === 'b')?.is_new).toBe(0);
  });

  it('returns the SAME array reference when nothing changed', () => {
    const list = [row('a', 1), row('b', 0)];
    // 'a' still new, 'b' already seen → no flip.
    const out = applySeenToList(list, new Set(['a']));
    expect(out).toBe(list);
  });

  it('returns the same reference when every new row is still new', () => {
    const list = [row('a', 1), row('b', 1)];
    const out = applySeenToList(list, new Set(['a', 'b']));
    expect(out).toBe(list);
  });

  it('only gives changed rows a new object identity, keeping unchanged ones', () => {
    const list = [row('a', 1), row('b', 1), row('c', 0)];
    const out = applySeenToList(list, new Set(['a']));
    expect(out).not.toBe(list);
    expect(out[0]).toBe(list[0]); // 'a' still new → same object
    expect(out[1]).not.toBe(list[1]); // 'b' flipped → new object
    expect(out[2]).toBe(list[2]); // 'c' already seen → untouched
  });

  it('never touches a row that is already seen', () => {
    const list = [row('a', 0, 'keep')];
    const out = applySeenToList(list, new Set());
    expect(out).toBe(list);
    expect(out[0].is_new).toBe(0);
  });

  it('clears every new row when the still-new set is empty', () => {
    const list = [row('a', 1), row('b', 1)];
    const out = applySeenToList(list, new Set());
    expect(out.every((r) => r.is_new === 0)).toBe(true);
  });

  it('preserves the other fields of a flipped row', () => {
    const list = [row('a', 1, 'via marconi')];
    const out = applySeenToList(list, new Set());
    expect(out[0]).toEqual({ source_id: 'a', is_new: 0, label: 'via marconi' });
  });

  it('handles an empty list', () => {
    const list: Row[] = [];
    const out = applySeenToList(list, new Set(['a']));
    expect(out).toBe(list);
    expect(out).toEqual([]);
  });
});
