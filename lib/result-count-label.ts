/**
 * Pure core for the feed's result-count header.
 *
 * The header shows how many permits match the current view. When filters or a
 * search narrow the feed below the unfiltered total, it also surfaces that total
 * ("12 di 480 pratiche") so the user understands the list is a slice of their
 * followed permits, not the whole dataset. When nothing narrows (shown === total)
 * it stays a plain count ("480 pratiche"), matching the pre-feature behaviour.
 *
 * `showTotal` is derived purely from the two counts — total strictly greater than
 * shown — so it fires for ANY narrowing cause (a deselected filing-type chip, a
 * status filter, a search) without the header having to know which control did it.
 *
 * Number formatting (it-IT grouping) stays in the screen; this decides the shape
 * and the Italian plural of the noun.
 */

export interface ResultCount {
  /** Sanitized count of permits matching the current view. */
  shown: number;
  /** Sanitized unfiltered total; equals `shown` when the "di total" form is hidden. */
  total: number;
  /** True when the view is narrowed (total > shown) and the total is worth showing. */
  showTotal: boolean;
  /** Italian noun agreeing with the governing number (total when shown, else shown). */
  noun: 'pratica' | 'pratiche';
}

function sanitizeCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function buildResultCount(shown: number, total: number): ResultCount {
  const s = sanitizeCount(shown);
  const t = sanitizeCount(total);
  const showTotal = t > s;
  const governing = showTotal ? t : s;
  const noun: ResultCount['noun'] = governing === 1 ? 'pratica' : 'pratiche';
  return { shown: s, total: showTotal ? t : s, showTotal, noun };
}
