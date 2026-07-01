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
 *   shape or returned an error page — or when the page carried records but
 *   *none* survived per-row validation (a renamed/removed required field: a
 *   partial shape drift, see below). Individual rows that fail validation on an
 *   otherwise-usable page are skipped (counted in {@link ParsedPage.skipped})
 *   rather than fatal, so a single bad record does not lose an entire page.
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

  // A page the API returned WITH records but from which NONE survived per-row
  // validation is a partial shape drift (e.g. a renamed required field makes
  // every row fail), not a genuinely-empty page. If we returned `{results: []}`
  // here it would be indistinguishable from end-of-data: the pagination walk
  // (`walkPages` stops on an empty page) would halt and the sync would falsely
  // report success with 0 fetched — a silently dead feed. Fail loud instead so
  // retry.ts (which treats SyncIngressError as permanent) surfaces it on the
  // dataset's SyncResult. A truly-empty page (`results.length === 0`) is the
  // normal end-of-data signal and is left untouched.
  if (envelope.data.results.length > 0 && results.length === 0) {
    throw new SyncIngressError(
      `Risposta open-data non valida: ${skipped} record presenti ma nessuno con la forma attesa ` +
        `(possibile cambio di schema dell'endpoint)`
    );
  }

  return { results, totalCount: envelope.data.total_count, skipped };
}
