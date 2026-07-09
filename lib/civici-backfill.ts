import { decodeExtra, getCoords, getCivico, type Coords } from './permit-extra';
import { compactExtra } from './source-shared';
import { geocodeCivico, type CiviciIndex } from './geocode-civici';

/**
 * Pure back-fill planner for the P4 "widen Nei dintorni to edilizia" slice
 * (docs/P4-map-radius.md §3, director mandate #1): edilizia rows carry NO source
 * coordinate — only a `codvia` (street code, a promoted column) and a `civico`
 * (house number, stored in `extra`). This decides, for a batch of edilizia rows,
 * which ones can be geocoded from the `rifter_civici_pt` gazetteer index and what
 * their new `extra` string becomes, so the shipped proximity card
 * (`nearby-permits.ts`) — today rendered only on the four geo-dotted categories —
 * automatically widens to edilizia once the device glue applies the plan.
 *
 * This is the tested DECISION half; the device glue (page the gazetteer over the
 * transport into a {@link CiviciIndex}, load the edilizia rows from SQLite, apply
 * these updates) is the thin, headless-unverifiable layer built on top. Keeping
 * the decision pure means the load-bearing bits — idempotency, the geocode
 * fallback, the deterministic `extra` merge — are verified without a device.
 *
 * Safety / correctness properties, all tested:
 *  - **Idempotent.** A row that ALREADY has a usable `extra.lat/lon` (a re-run, or
 *    a future edilizia coordinate source) is left untouched — never re-geocoded,
 *    never re-emitted — so applying the plan twice is a no-op.
 *  - **No coordinate asserted blindly.** A row whose `codvia`(+`civico`) does not
 *    resolve in the index yields no update (counted `unresolved`); an unknown
 *    street is never given a made-up pin.
 *  - **Deterministic merge.** New `lat`/`lon` are appended to the row's EXISTING
 *    decoded `extra` (preserving `civico` and any other key, in a stable order via
 *    {@link compactExtra}), so the emitted JSON round-trips identically — matching
 *    how the geo-dotted normalizers already write coordinates and keeping
 *    `classifyUpsert`'s string-equality change detection stable.
 */

/**
 * The minimal shape of an edilizia row the planner needs: its stable `source_id`
 * (the apply-side WHERE key), its `codvia` join key (the promoted column, so
 * `null` when the source row had no street code), and its raw `extra` JSON (source
 * of the `civico` join key and any already-present coordinate).
 */
export interface EdiliziaBackfillRow {
  source_id: string;
  codvia: number | null;
  extra: string;
}

/** One planned write: set `extra` (coordinates merged in) for `source_id`. */
export interface CiviciBackfillUpdate {
  source_id: string;
  extra: string;
}

/** The outcome of planning a batch: the writes plus a per-row disposition tally. */
export interface CiviciBackfillPlan {
  /** Rows to UPDATE, each with its new `extra` string. */
  updates: CiviciBackfillUpdate[];
  /** Rows freshly geocoded this pass (= `updates.length`). */
  geocoded: number;
  /** Rows skipped because they already carried a usable coordinate. */
  alreadyCoded: number;
  /** Rows whose `codvia`(+`civico`) did not resolve against the index. */
  unresolved: number;
}

/** Merge a resolved coordinate into a row's existing `extra`, deterministically. */
function extraWithCoords(rawExtra: string, coords: Coords): string {
  return compactExtra({
    ...decodeExtra(rawExtra),
    lat: String(coords.lat),
    lon: String(coords.lon),
  });
}

/**
 * Plan the coordinate back-fill for a batch of edilizia rows against a built
 * gazetteer {@link CiviciIndex}. Returns the deterministic list of `extra` writes
 * plus a disposition tally. Pure — no SQLite, no network, no clock.
 */
export function planCiviciBackfill(
  rows: readonly EdiliziaBackfillRow[],
  index: CiviciIndex
): CiviciBackfillPlan {
  const updates: CiviciBackfillUpdate[] = [];
  let alreadyCoded = 0;
  let unresolved = 0;

  for (const row of rows) {
    // Idempotent: a row that already has a coordinate is never touched.
    if (getCoords(row.extra) !== null) {
      alreadyCoded++;
      continue;
    }
    const coords = geocodeCivico(index, row.codvia, getCivico(row.extra));
    if (coords === null) {
      unresolved++;
      continue;
    }
    updates.push({ source_id: row.source_id, extra: extraWithCoords(row.extra, coords) });
  }

  return { updates, geocoded: updates.length, alreadyCoded, unresolved };
}
