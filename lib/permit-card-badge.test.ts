import { describe, it, expect } from 'vitest';
import { permitCardBadge } from './permit-card-badge';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './sources';
import { FILING_COLORS, FILING_TYPE_ABBREV, type FilingType } from './constants';

describe('permitCardBadge', () => {
  it('gives an edilizia row its filing-type color and abbreviated acronym', () => {
    for (const ft of ['PDC', 'SCIA', 'CILA'] as FilingType[]) {
      expect(permitCardBadge({ category: 'edilizia', filing_type: ft })).toEqual({
        bg: FILING_COLORS[ft].bg,
        text: FILING_COLORS[ft].text,
        label: FILING_TYPE_ABBREV[ft],
      });
    }
  });

  it('uses PdC (not the raw enum) for the edilizia PDC label', () => {
    expect(permitCardBadge({ category: 'edilizia', filing_type: 'PDC' }).label).toBe('PdC');
  });

  it.each(['cantieri', 'commercio', 'eventi', 'segnalazioni'] as const)(
    'gives a %s row its category color and label, never a filing token',
    (category) => {
      // A non-edilizia row stores its category token in `filing_type`; the badge must
      // ignore it and use the category color/label (the bug: it fell back to PdC
      // olive-gold + printed the raw token).
      const badge = permitCardBadge({
        category,
        filing_type: category.toUpperCase() as FilingType,
      });
      expect(badge).toEqual({
        bg: CATEGORY_COLORS[category].bg,
        text: CATEGORY_COLORS[category].text,
        label: CATEGORY_LABELS[category],
      });
      // The former olive-gold PdC fallback must NOT leak onto a non-edilizia row.
      expect(badge.text).not.toBe(FILING_COLORS.PDC.text);
      expect(badge.label).not.toBe(category.toUpperCase());
    }
  );

  it('never falls back to olive-gold PdC for a cantiere (the fixed defect)', () => {
    const badge = permitCardBadge({ category: 'cantieri', filing_type: 'CANTIERE' as FilingType });
    expect(badge.bg).toBe(CATEGORY_COLORS.cantieri.bg);
    expect(badge.text).toBe(CATEGORY_COLORS.cantieri.text);
    expect(badge.label).toBe('Cantieri');
  });

  it('defends against an unknown edilizia filing type without throwing', () => {
    const badge = permitCardBadge({ category: 'edilizia', filing_type: 'XYZ' as FilingType });
    expect(badge.bg).toBe(FILING_COLORS.PDC.bg);
    expect(badge.label).toBe('XYZ');
  });
});
