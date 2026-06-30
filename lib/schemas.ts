import { z } from 'zod';
import type { RawRecord } from './normalize';

/**
 * Schema validation at the sync ingress boundary.
 *
 * The Bologna open-data API (ODS v2.1) is an external network boundary — its
 * field shapes are not guaranteed and can drift (renamed fields, an endpoint
 * that 404s into an HTML error page, a changed envelope). We parse the payload
 * with a schema here instead of trusting TS types, so a shape change surfaces
 * as a typed {@link SyncIngressError} instead of silently corrupting the DB.
 */

/** Thrown when the open-data payload does not match the expected envelope shape. */
export class SyncIngressError extends Error {
  constructor(
    message: string,
    readonly issues?: unknown
  ) {
    super(message);
    this.name = 'SyncIngressError';
  }
}

/** A field that may be absent or null in the payload; normalized to `null`. */
const optNull = <T extends z.ZodTypeAny>(inner: T) => inner.nullish().transform((v) => v ?? null);

/**
 * One open-data record. Only the fields the app consumes are validated; unknown
 * fields are passed through untouched (the API returns many we ignore).
 */
export const rawRecordSchema = z
  .object({
    // Protocol number/year identify the record — must be present.
    richiesta_ndeg_prot: z.number(),
    // Year arrives as a string in the API, but tolerate a numeric form too.
    richiesta_anno_prot: z.union([z.string(), z.number().transform((n) => String(n))]),
    richiesta_data: optNull(z.string()),
    procedimento: optNull(z.string()),
    esito_pratica: optNull(z.string()),
    chiusura_pratica_data: optNull(z.string()),
    codvia: optNull(z.number()),
    civico: optNull(z.number()),
    esponenteciv: optNull(z.string()),
    localizzazioni_lista: optNull(z.string()),
  })
  .passthrough();

/** The paged-results envelope returned by the ODS records endpoint. */
export const apiResponseSchema = z.object({
  total_count: z
    .number()
    .nullish()
    .transform((v) => v ?? 0),
  // Validate that `results` is an array of objects; individual records are
  // checked per-row below so one malformed row cannot abort the whole sync.
  results: z
    .array(z.unknown())
    .nullish()
    .transform((v) => v ?? []),
});

export interface ParsedPage {
  results: RawRecord[];
  totalCount: number;
  /** Count of rows dropped because they failed {@link rawRecordSchema}. */
  skipped: number;
}

/**
 * Validate a raw open-data JSON payload at the sync ingress boundary.
 *
 * @throws {SyncIngressError} when the top-level envelope shape is wrong
 *   (not an object, `results` not an array, etc.) — i.e. the endpoint changed
 *   shape or returned an error page. Individual rows that fail validation are
 *   skipped (counted in {@link ParsedPage.skipped}) rather than fatal, so a
 *   single bad record does not lose an entire page.
 */
export function parseApiResponse(payload: unknown): ParsedPage {
  const envelope = apiResponseSchema.safeParse(payload);
  if (!envelope.success) {
    const detail = envelope.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new SyncIngressError(`Risposta open-data non valida: ${detail}`, envelope.error.issues);
  }

  const results: RawRecord[] = [];
  let skipped = 0;
  for (const row of envelope.data.results) {
    const record = rawRecordSchema.safeParse(row);
    if (record.success) {
      results.push(record.data);
    } else {
      skipped++;
    }
  }

  return { results, totalCount: envelope.data.total_count, skipped };
}
