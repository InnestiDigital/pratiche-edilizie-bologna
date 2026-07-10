import { Category, CATEGORY_COLORS, CATEGORY_LABELS } from './sources';
import { FILING_COLORS, FILING_TYPE_ABBREV, type FilingType } from './constants';

export interface CardBadge {
  bg: string;
  text: string;
  label: string;
}

/**
 * The compact identity chip shown on a permit's list/cross-nav rows: the
 * filing-type acronym in its own color for edilizia (PdC/SCIA/CILA), the category
 * label in its category color for every other source (Cantieri/Commercio/…).
 *
 * Single source of truth for that chip so it can't drift between the feed card and
 * the detail's "Nella stessa zona" / "Nei dintorni" rows. Those detail rows used to
 * reach for `FILING_COLORS[filing_type]` unconditionally and print the raw
 * `filing_type` token — but a non-edilizia row stores its category token there
 * ('CANTIERE', 'COMMERCIO', …), which is NOT a `FilingType`: the color lookup missed
 * and fell back to PdC's olive-gold, and the label read as a bare uppercase token.
 * A cantiere row then showed an olive "CANTIERE" chip, clashing with the same
 * permit's category-colored feed card and detail header. Branch on the category (as
 * the feed card does) so `filing_type` is only indexed when it is genuinely a
 * filing type.
 */
export function permitCardBadge(permit: {
  category: Category;
  filing_type: FilingType;
}): CardBadge {
  if (permit.category === 'edilizia') {
    const colors = FILING_COLORS[permit.filing_type] ?? FILING_COLORS.PDC;
    return {
      bg: colors.bg,
      text: colors.text,
      label: FILING_TYPE_ABBREV[permit.filing_type] ?? permit.filing_type,
    };
  }
  const cc = CATEGORY_COLORS[permit.category] ?? CATEGORY_COLORS.edilizia;
  return { bg: cc.bg, text: cc.text, label: CATEGORY_LABELS[permit.category] };
}
