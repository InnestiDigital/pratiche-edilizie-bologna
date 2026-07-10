/**
 * The single "headline" for a civic record — the one bold line the detail header,
 * the shared text, and the "Nei dintorni" row all lead with.
 *
 * edilizia carries its headline in `address` (its `title` is always null — see
 * normalize.ts) and heads the card with the street. Every other source
 * (cantieri, commercio, eventi, segnalazioni) carries the real name — the works
 * description, tipo_intervento, event name, or report subcategory — in `title`,
 * and `source-segnalazioni.ts` deliberately stamps `address: null` (a report has
 * no street, only a proximity zone).
 *
 * Reading `address` alone — as the detail header and the share builder both did —
 * therefore rendered the "Indirizzo non disponibile" placeholder for EVERY
 * segnalazione and buried the real name behind the address for the other three
 * categories. Prefer the title, fall back to the address, then the placeholder;
 * blank / whitespace-only values count as absent. This is the single source of
 * truth so the header, the share text and the nearby row can never disagree.
 */
export const NO_HEADLINE = 'Indirizzo non disponibile';

/** The structural subset of a permit the headline is derived from. */
export interface PermitHeadlineInput {
  title: string | null;
  address: string | null;
}

export function permitHeadline({ title, address }: PermitHeadlineInput): string {
  return nonBlank(title) ?? nonBlank(address) ?? NO_HEADLINE;
}

/** Trim and collapse blank/whitespace-only (and nullish) strings to `null`. */
function nonBlank(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
