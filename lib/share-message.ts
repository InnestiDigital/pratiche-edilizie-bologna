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

/**
 * The permit facts worth sharing. A structural subset of the screen's `Permit`
 * plus the labels/protocol the screen has already derived — so the builder stays
 * pure and does not re-implement the label maps.
 */
export interface ShareMessageInput {
  /** Human filing-type label, e.g. "Permesso di Costruire". */
  filingLabel: string;
  address: string | null;
  /** Quartiere, when known. */
  zone: string | null;
  procedimento: string | null;
  /** Human status label, e.g. "Rilasciata". */
  statusLabel: string;
  /** Formatted protocol, e.g. "000481/2024". */
  protocol: string;
  /** Raw ODS request date (`richiesta_data`); formatted here, omitted when absent. */
  requestDate: string | null;
  /** Bologna open-data portal record link. */
  sourceLink: string | null;
}

const NO_ADDRESS = 'Indirizzo non disponibile';

/**
 * Build the multi-line share text for a permit.
 *
 * Line order (each line dropped when its value is absent):
 *   1. `<filing type> — <address>`   (always present; address falls back to a label)
 *   2. `<zone>`
 *   3. `<procedimento>`
 *   4. `Stato: <status>`
 *   5. `Protocollo: <protocol>`
 *   6. `Richiesta: <dd/mm/yyyy>`
 *   7. `<portal link>`
 *
 * Pure and total: never throws, always returns a non-empty string (the title line
 * is unconditional). Blank/whitespace-only optional fields are treated as absent.
 */
export function buildShareMessage(input: ShareMessageInput): string {
  const address = nonBlank(input.address) ?? NO_ADDRESS;
  const requestDate = formatItDate(input.requestDate);

  const lines: (string | null)[] = [
    `${input.filingLabel} — ${address}`,
    nonBlank(input.zone),
    nonBlank(input.procedimento),
    `Stato: ${input.statusLabel}`,
    `Protocollo: ${input.protocol}`,
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
