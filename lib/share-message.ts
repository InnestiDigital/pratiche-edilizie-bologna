/**
 * Pure builder for the text shared from the permit-detail "Condividi" action.
 *
 * The detail screen used to assemble this string inline, so the null-handling and
 * line ordering — the brittle bits a user actually sees pasted into WhatsApp / Mail —
 * were never unit-tested. This extracts that logic into a pure, Node-testable core
 * (the repo's standard "extract the pure core out of the device-coupled caller"
 * pattern); the screen just gathers the fields and calls `buildShareMessage`.
 *
 * Kept free of native imports so it runs in vitest and in the web export unchanged.
 * The request date is formatted through the shared `formatItDate` (TZ-safe, never
 * throws) rather than `new Date`.
 */

import { formatItDate } from './format-date';
import { permitHeadline } from './permit-headline';

/**
 * The permit facts worth sharing. A structural subset of the screen's `Permit`
 * plus the labels/protocol the screen has already derived — so the builder stays
 * pure and does not re-implement the label maps.
 */
export interface ShareMessageInput {
  /** Human filing-type label, e.g. "Permesso di Costruire". */
  filingLabel: string;
  /**
   * The record's real name for non-edilizia sources (works description, event
   * name, tipo_intervento, report subcategory); null for edilizia, which heads
   * with the address. Drives the shared headline via {@link permitHeadline}.
   */
  title: string | null;
  address: string | null;
  /** Quartiere, when known. */
  zone: string | null;
  procedimento: string | null;
  /** Human status label, e.g. "Rilasciata". */
  statusLabel: string;
  /**
   * Category-aware label for the reference id line, e.g. "Protocollo" for
   * edilizia/commercio, "Riferimento" for cantieri/eventi/segnalazioni whose
   * `source_id` is a record/ticket id, not an administrative protocollo.
   */
  referenceLabel: string;
  /** Formatted reference id, e.g. "000481/2024"; line dropped when blank. */
  protocol: string;
  /** Raw ODS request date (`richiesta_data`); formatted here, omitted when absent. */
  requestDate: string | null;
  /** Bologna open-data portal record link. */
  sourceLink: string | null;
}

/**
 * Build the multi-line share text for a permit.
 *
 * Line order (each line dropped when its value is absent):
 *   1. `<filing type> — <headline>`   (always present; headline = title ?? address ?? label)
 *   2. `<address>`   (only when the headline is the title — a non-edilizia record with a street)
 *   3. `<zone>`
 *   4. `<procedimento>`
 *   5. `Stato: <status>`
 *   6. `<referenceLabel>: <protocol>`   (dropped when the reference id is blank)
 *   7. `Richiesta: <dd/mm/yyyy>`
 *   8. `<portal link>`
 *
 * Pure and total: never throws, always returns a non-empty string (the title line
 * is unconditional). Blank/whitespace-only optional fields are treated as absent.
 */
export function buildShareMessage(input: ShareMessageInput): string {
  const title = nonBlank(input.title);
  const address = nonBlank(input.address);
  const requestDate = formatItDate(input.requestDate);
  const protocol = nonBlank(input.protocol);

  const lines: (string | null)[] = [
    `${input.filingLabel} — ${permitHeadline({ title, address })}`,
    // The address on its own line only when the headline is the title (a non-
    // edilizia record with a street); for edilizia the address IS the headline,
    // and a segnalazione genuinely has none.
    title ? address : null,
    nonBlank(input.zone),
    nonBlank(input.procedimento),
    `Stato: ${input.statusLabel}`,
    protocol ? `${input.referenceLabel}: ${protocol}` : null,
    requestDate ? `Richiesta: ${requestDate}` : null,
    nonBlank(input.sourceLink),
  ];

  return lines.filter((l): l is string => l !== null).join('\n');
}

/** Trim and collapse blank/whitespace-only strings (and nullish) to `null`. */
function nonBlank(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
