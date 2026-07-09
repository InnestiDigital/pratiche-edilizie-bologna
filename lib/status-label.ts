import { STATUS_LABELS } from './constants';
import { Category } from './sources';

/**
 * Category-specific status-label overrides where the shared STATUS_LABELS entry
 * would read with the wrong grammatical gender.
 *
 * `concluso` is the only status shared between a masculine-noun category and a
 * feminine-noun one: a *cantiere* is masculine ("cantiere Concluso") while a
 * *pratica* edilizia/commercio is feminine ("pratica Conclusa"). STATUS_LABELS
 * holds the cantieri-correct "Concluso"; edilizia and commercio (which
 * `category-statuses.ts` lets carry `concluso`) override it to "Conclusa" so the
 * pill agrees with the domain noun the rest of the screen uses. Mirrors the
 * category-aware closing-date label in `feed-card-date.ts`.
 */
const CATEGORY_STATUS_LABEL_OVERRIDES: Partial<Record<Category, Record<string, string>>> = {
  edilizia: { concluso: 'Conclusa' },
  commercio: { concluso: 'Conclusa' },
};

/**
 * The status-pill label for a row, agreeing in gender with the category's domain
 * noun. Falls back to the shared STATUS_LABELS, then the raw source string —
 * exactly the `STATUS_LABELS[status] ?? status_raw` chain of the call sites it
 * replaces, with the per-category override applied first.
 */
export function statusLabelFor(status: string, category: Category, rawFallback: string): string {
  return (
    CATEGORY_STATUS_LABEL_OVERRIDES[category]?.[status] ?? STATUS_LABELS[status] ?? rawFallback
  );
}
