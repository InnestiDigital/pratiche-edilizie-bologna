/**
 * Pure visibility logic for the left/right edge fades on a horizontal scroll row.
 *
 * A horizontal chip row whose content is wider than its container clips its
 * off-screen chips at the edges, giving no cue that more options exist. The fade
 * overlays hint "there is more this way": show the LEFT fade once the row has been
 * scrolled away from its start, and the RIGHT fade while there is still content
 * past the visible end. When the content fits (no overflow) neither fade shows, so
 * a short row never implies a scroll that isn't there.
 *
 * Extracted from the presentational component so the geometry is unit-tested
 * without a device (repo pattern: pure core + thin coupled caller).
 */
export interface EdgeFadeVisibility {
  left: boolean;
  right: boolean;
}

/**
 * @param contentWidth  total width of the scrollable content (onContentSizeChange)
 * @param containerWidth visible width of the row (onLayout)
 * @param scrollX       current horizontal scroll offset (onScroll contentOffset.x)
 * @param tolerance     px slack so sub-pixel rounding / bounce doesn't flicker the fades
 */
export function edgeFadeVisibility(
  contentWidth: number,
  containerWidth: number,
  scrollX: number,
  tolerance = 1
): EdgeFadeVisibility {
  // Guard against NaN / Infinity / negative geometry from a mid-layout frame.
  const content = sanitize(contentWidth);
  const container = sanitize(containerWidth);
  const tol = Math.max(0, sanitize(tolerance));
  // Clamp scroll into the real scrollable range; overscroll/bounce can report
  // negative or beyond-max offsets that would otherwise keep a fade stuck on.
  const maxScroll = Math.max(0, content - container);
  const offset = clamp(sanitize(scrollX), 0, maxScroll);

  return {
    left: offset > tol,
    right: maxScroll > tol && offset < maxScroll - tol,
  };
}

function sanitize(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
