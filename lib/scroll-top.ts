// Pure decision for the feed's "scroll to top" floating button: given the current
// vertical scroll offset, should the button be visible? Extracted so the threshold
// logic (and its guard against the junk offsets react-native's scroll events can
// briefly emit mid-layout: NaN, Infinity, negative overscroll) is unit-tested
// without a device. The feed screen wires this to the SectionList's onScroll.

// Show the button once the user has scrolled roughly one screen height down, so it
// never appears while the top of the list is still in view.
export const SCROLL_TOP_THRESHOLD = 600;

/**
 * True when the "back to top" button should be shown for the given scroll offset.
 * Non-finite or negative offsets (rubber-band overscroll, mid-layout garbage)
 * collapse to false so the button never flickers on at the very top.
 */
export function shouldShowScrollTop(
  offsetY: number,
  threshold: number = SCROLL_TOP_THRESHOLD
): boolean {
  if (!Number.isFinite(offsetY) || offsetY < 0) return false;
  const bound = Number.isFinite(threshold) && threshold > 0 ? threshold : SCROLL_TOP_THRESHOLD;
  return offsetY >= bound;
}
