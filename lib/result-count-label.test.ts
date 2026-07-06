import { describe, it, expect } from 'vitest';
import { buildResultCount } from './result-count-label';

describe('buildResultCount', () => {
  it('hides the total when nothing is narrowed (shown === total)', () => {
    expect(buildResultCount(8, 8)).toEqual({
      shown: 8,
      total: 8,
      showTotal: false,
      noun: 'voci',
    });
  });

  it('uses the singular noun for a single unfiltered result', () => {
    expect(buildResultCount(1, 1)).toEqual({
      shown: 1,
      total: 1,
      showTotal: false,
      noun: 'voce',
    });
  });

  it('shows the total when the view is narrowed below it', () => {
    expect(buildResultCount(12, 480)).toEqual({
      shown: 12,
      total: 480,
      showTotal: true,
      noun: 'voci',
    });
  });

  it('agrees the noun with the total (not shown) in the "di total" form', () => {
    // shown is 1 but the governing number is the total → plural.
    expect(buildResultCount(1, 20).noun).toBe('voci');
  });

  it('handles a single-permit total narrowing (0 di 1 voce)', () => {
    expect(buildResultCount(0, 1)).toEqual({
      shown: 0,
      total: 1,
      showTotal: true,
      noun: 'voce',
    });
  });

  it('falls back to the plain form when total does not exceed shown', () => {
    // Defensive: a stale/racey total below shown must not render "5 di 3".
    expect(buildResultCount(5, 3)).toEqual({
      shown: 5,
      total: 5,
      showTotal: false,
      noun: 'voci',
    });
  });

  it('is plain and singular for zero results (0 voci)', () => {
    expect(buildResultCount(0, 0)).toEqual({
      shown: 0,
      total: 0,
      showTotal: false,
      noun: 'voci',
    });
  });

  it('floors fractional counts', () => {
    expect(buildResultCount(2.9, 20.9)).toEqual({
      shown: 2,
      total: 20,
      showTotal: true,
      noun: 'voci',
    });
  });

  it('sanitizes negative / NaN / Infinity to zero', () => {
    expect(buildResultCount(-4, Number.NaN)).toEqual({
      shown: 0,
      total: 0,
      showTotal: false,
      noun: 'voci',
    });
    expect(buildResultCount(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toEqual({
      shown: 0,
      total: 0,
      showTotal: false,
      noun: 'voci',
    });
  });
});
