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
  // A cantiere is a roadwork *site*, not a *pratica*. The shared `concluso` caption
  // — "L’iter della pratica si è concluso" — names the wrong domain noun on a
  // roadwork (same mismatch the `concluso` → "Concluso" label override in
  // `status-label.ts` already fixes for the pill). Override with cantiere-worded copy
  // mirroring the shared `in_corso` caption ("I lavori del cantiere…"). `in_corso`
  // is already cantiere-correct and falls through; `altro` has no caption (undefined).
  cantieri: {
    concluso: 'I lavori del cantiere si sono conclusi.',
  },
  // Every segnalazione carries the constant `altro` status (the dataset exposes no
  // outcome field). Shown as "Ricevuta" (see `status-label.ts`); without a caption
  // the segnalazione hero was the only one to end at a bare, unexplained pill. This
  // honest one-liner explains the state — and why there is no further one — bringing
  // the hero to parity with the other four categories.
  segnalazioni: {
    altro: 'La segnalazione è stata inviata al Comune; il dataset pubblico non ne riporta l’esito.',
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
