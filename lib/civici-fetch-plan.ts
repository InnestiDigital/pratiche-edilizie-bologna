import { buildCodviaInWhere } from './ods-request';
import { MAX_OFFSET } from './paginate';

/**
 * Pure planner for the SCOPED gazetteer fetch that powers the P4 "widen Nei
 * dintorni to edilizia" slice (docs/P4-map-radius.md §3, director mandate #1).
 *
 * The problem it solves: edilizia rows carry NO source coordinate — only a
 * `codvia` (street code) + `civico` (house number) — so they can only be pinned
 * by geocoding against the `rifter_civici_pt` gazetteer. But that gazetteer is
 * ~77 600 rows, far past the ODS `MAX_OFFSET` (9900) cap, so a naive full walk
 * silently drops ~87% of it. The fix is to invert the fetch: we only need civici
 * for the `codvia` values that actually appear in local edilizia rows (a small
 * subset of all Bologna streets), so this module extracts that distinct-`codvia`
 * set and batches it into cap-safe scoped `where=codvia in (…)` fetches.
 *
 * It is the DECISION half — the fetch PLAN — paired with the already-tested
 * cores it feeds: {@link import('./source-civici').parseCiviciPage} (ingress),
 * {@link import('./geocode-civici').buildCiviciIndex} (the lookup) and
 * {@link import('./civici-backfill').planCiviciBackfill} (the apply decision).
 * The device glue that pages each batch over the transport, builds the index and
 * applies the backfill is the thin, headless-unverifiable layer built on top.
 * Keeping the plan pure means the cap-safety (no batch can overrun the offset
 * cap and silently truncate) is verified without a device or a network.
 */

/**
 * Conservative upper bound on how many civic points a single Bologna street can
 * hold. Used to derive {@link CODVIA_BATCH_SIZE} so a batch's worst-case row
 * count (`batchSize × this`) stays under {@link MAX_OFFSET} — no batch can hit
 * the ODS offset cap and lose the tail of a street's civici. Bologna's longest
 * streets are well under this; it is deliberately generous, trading a few extra
 * requests for a guarantee that the walk never truncates.
 */
export const MAX_CIVICI_PER_CODVIA = 500;

/**
 * How many `codvia` codes to fold into one scoped fetch. Derived so the batch's
 * worst-case civici count cannot reach {@link MAX_OFFSET}: even if every street
 * in the batch held {@link MAX_CIVICI_PER_CODVIA} points, the total stays below
 * the cap, so the batch's page walk always ends on a short/empty page — never on
 * the cap — and no civico is silently lost.
 */
export const CODVIA_BATCH_SIZE = Math.floor(MAX_OFFSET / MAX_CIVICI_PER_CODVIA);

/** The minimal shape the planner reads off a stored row: its street code. */
export interface CodviaCarrier {
  /** ODS street code — the join key; `null` when the source row had none. */
  codvia: number | null;
}

/** One scoped gazetteer fetch: the `codvia` set and its ready `where` clause. */
export interface CiviciFetchBatch {
  /** The (ascending, de-duped) street codes this batch fetches. */
  codvias: number[];
  /** The ODS-QL `where` clause scoping the page walk to those codes. */
  where: string;
}

/**
 * Extract the distinct, valid street codes from a batch of rows: `null`,
 * non-finite, negative and non-integer `codvia`s are dropped (only a real join
 * key survives, so the downstream `where` builder never throws on live data),
 * duplicates are collapsed, and the result is sorted ascending so the plan — and
 * every `where` clause it produces — is deterministic.
 */
export function distinctCodvia(rows: readonly CodviaCarrier[]): number[] {
  const seen = new Set<number>();
  for (const { codvia } of rows) {
    if (codvia == null || !Number.isInteger(codvia) || codvia < 0) continue;
    seen.add(codvia);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Split a distinct-`codvia` set into cap-safe scoped fetches. Each batch folds
 * up to `batchSize` codes into one {@link buildCodviaInWhere} clause; the final
 * batch may be short. An empty set yields no batches (nothing to fetch).
 *
 * `codvias` is assumed already distinct + valid (as {@link distinctCodvia}
 * returns); `batchSize` defaults to the cap-safe {@link CODVIA_BATCH_SIZE} and
 * must be a positive integer.
 */
export function planCiviciFetch(
  codvias: readonly number[],
  batchSize: number = CODVIA_BATCH_SIZE
): CiviciFetchBatch[] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError(`planCiviciFetch: batchSize must be a positive integer, got ${batchSize}`);
  }

  const batches: CiviciFetchBatch[] = [];
  for (let i = 0; i < codvias.length; i += batchSize) {
    const chunk = codvias.slice(i, i + batchSize);
    batches.push({ codvias: chunk, where: buildCodviaInWhere(chunk) });
  }
  return batches;
}
