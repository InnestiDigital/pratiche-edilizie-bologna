import { describe, it, expect } from 'vitest';
import { shouldShowScrollTop, SCROLL_TOP_THRESHOLD } from './scroll-top';

describe('shouldShowScrollTop', () => {
  it('is hidden at the very top', () => {
    expect(shouldShowScrollTop(0)).toBe(false);
  });

  it('is hidden below the threshold', () => {
    expect(shouldShowScrollTop(SCROLL_TOP_THRESHOLD - 1)).toBe(false);
  });

  it('is shown at exactly the threshold', () => {
    expect(shouldShowScrollTop(SCROLL_TOP_THRESHOLD)).toBe(true);
  });

  it('is shown well past the threshold', () => {
    expect(shouldShowScrollTop(5000)).toBe(true);
  });

  it('honors a custom threshold', () => {
    expect(shouldShowScrollTop(150, 100)).toBe(true);
    expect(shouldShowScrollTop(80, 100)).toBe(false);
  });

  it('collapses negative overscroll offsets to hidden', () => {
    expect(shouldShowScrollTop(-40)).toBe(false);
    expect(shouldShowScrollTop(-9999)).toBe(false);
  });

  it('collapses non-finite offsets to hidden', () => {
    expect(shouldShowScrollTop(NaN)).toBe(false);
    expect(shouldShowScrollTop(Infinity)).toBe(false);
    expect(shouldShowScrollTop(-Infinity)).toBe(false);
  });

  it('falls back to the default when the threshold is junk', () => {
    // A non-finite / non-positive threshold must not disable the button entirely.
    expect(shouldShowScrollTop(SCROLL_TOP_THRESHOLD, NaN)).toBe(true);
    expect(shouldShowScrollTop(SCROLL_TOP_THRESHOLD, 0)).toBe(true);
    expect(shouldShowScrollTop(SCROLL_TOP_THRESHOLD, -100)).toBe(true);
    expect(shouldShowScrollTop(SCROLL_TOP_THRESHOLD - 1, NaN)).toBe(false);
  });
});
