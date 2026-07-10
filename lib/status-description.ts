import { STATUS_DESCRIPTIONS } from './constants';
import { Category } from './sources';

/**
 * Category-specific status-description overrides where the shared
 * STATUS_DESCRIPTIONS caption would be domain-wrong.
 *
 * The shared map is edilizia-flavoured ("Il titolo edilizio è stato concesso… i
 * lavori possono essere eseguiti"). Commercio filings are business notifications
 * (aperture, subingressi, licenze), NOT building permits — that wording reads as
 * nonsense on e.g. a bar-opening record. Override only the statuses whose shared
 * copy names a "titolo edilizio", "lavori", or "intervento"; the remaining statuses
 * commercio can carry (in_attesa, concluso, annullata, archiviata, rinunciata) use
 * generic *pratica* wording that is already correct and fall through. Mirrors the
 * category-aware `statusLabelFor`.
 */
const CATEGORY_STATUS_DESCRIPTION_OVERRIDES: Partial<Record<Category, Record<string, string>>> = {
  commercio: {
    rilasciata: 'L’attività è stata autorizzata dal Comune e può essere avviata.',
    rilasciata_con_prescrizioni:
      'L’attività è stata autorizzata, ma con condizioni o prescrizioni da rispettare.',
    diniegata:
      'Il Comune ha respinto la richiesta: l’attività non può essere avviata così com’era stata presentata.',
    decaduta:
      'Il titolo ha perso efficacia e l’attività non può più essere avviata su questa base.',
  },
};

/**
 * The plain-Italian caption shown under the status pill on the detail screen,
 * category-aware. Commercio gets business-worded copy where the shared edilizia
 * wording ("titolo edilizio"/"lavori") would be wrong; every other category and
 * every unlisted status falls back to the shared STATUS_DESCRIPTIONS (undefined for
 * 'altro'/unknown, so the UI renders no caption rather than placeholder text).
 */
export function statusDescriptionFor(status: string, category: Category): string | undefined {
  return CATEGORY_STATUS_DESCRIPTION_OVERRIDES[category]?.[status] ?? STATUS_DESCRIPTIONS[status];
}
