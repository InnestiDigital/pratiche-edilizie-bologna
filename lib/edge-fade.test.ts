import { describe, it, expect } from 'vitest';
import { edgeFadeVisibility } from './edge-fade';

describe('edgeFadeVisibility', () => {
  it('shows neither fade when content fits the container', () => {
    expect(edgeFadeVisibility(200, 320, 0)).toEqual({ left: false, right: false });
  });

  it('shows only the right fade at the start of an overflowing row', () => {
    expect(edgeFadeVisibility(600, 320, 0)).toEqual({ left: false, right: true });
  });

  it('shows both fades in the middle of an overflowing row', () => {
    expect(edgeFadeVisibility(600, 320, 100)).toEqual({ left: true, right: true });
  });

  it('shows only the left fade at the very end of an overflowing row', () => {
    // maxScroll = 600 - 320 = 280
    expect(edgeFadeVisibility(600, 320, 280)).toEqual({ left: true, right: false });
  });

  it('treats exactly-fitting content (content == container) as no overflow', () => {
    expect(edgeFadeVisibility(320, 320, 0)).toEqual({ left: false, right: false });
  });

  it('clamps overscroll past the end so the right fade does not stick on', () => {
    // bounce reports offset beyond maxScroll (280)
    expect(edgeFadeVisibility(600, 320, 400)).toEqual({ left: true, right: false });
  });

  it('clamps negative overscroll so the left fade does not stick on', () => {
    // rubber-band before the start reports a negative offset
    expect(edgeFadeVisibility(600, 320, -30)).toEqual({ left: false, right: true });
  });

  it('respects the tolerance band near the edges (no flicker on sub-pixel offsets)', () => {
    // maxScroll = 280; within 1px of either edge → treat as at that edge
    expect(edgeFadeVisibility(600, 320, 0.5)).toEqual({ left: false, right: true });
    expect(edgeFadeVisibility(600, 320, 279.5)).toEqual({ left: true, right: false });
  });

  it('honours a custom tolerance', () => {
    // 5px from the start, tolerance 8 → still "at start" (no left fade)
    expect(edgeFadeVisibility(600, 320, 5, 8)).toEqual({ left: false, right: true });
  });

  it('shows no fade before geometry is measured (zero widths)', () => {
    expect(edgeFadeVisibility(0, 0, 0)).toEqual({ left: false, right: false });
  });

  it('ignores NaN / Infinity geometry from a mid-layout frame', () => {
    expect(edgeFadeVisibility(NaN, 320, 0)).toEqual({ left: false, right: false });
    expect(edgeFadeVisibility(Infinity, 320, 0)).toEqual({ left: false, right: false });
    expect(edgeFadeVisibility(600, 320, NaN)).toEqual({ left: false, right: true });
  });
});
