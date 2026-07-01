import type { UpsertOutcome } from './upsert-classify';

/**
 * Per-dataset tally of upsert outcomes.
 *
 * `inserted` / `updated` are reported per dataset in the `SyncResult` and feed
 * the "new permits" push notification (via `summarizeSyncResults`). Keeping the
 * count in one pure, exhaustively-tested place — rather than inline `if`
 * increments duplicated across `syncRecent` and `syncFull` — makes it the single
 * source of truth for how outcomes become counts, matching `classifyUpsert`
 * (which decides the outcome) upstream.
 */
export interface UpsertTally {
  inserted: number;
  updated: number;
}

/**
 * Count how many upsert outcomes were inserts vs updates. `unchanged` outcomes
 * (including raced duplicates classified as unchanged) are intentionally not
 * counted, so they never inflate the notification.
 */
export function tallyOutcomes(outcomes: readonly UpsertOutcome[]): UpsertTally {
  const tally: UpsertTally = { inserted: 0, updated: 0 };
  for (const outcome of outcomes) {
    switch (outcome) {
      case 'inserted':
        tally.inserted++;
        break;
      case 'updated':
        tally.updated++;
        break;
      case 'unchanged':
        break;
      default: {
        // Compiler-enforced exhaustiveness: adding a new UpsertOutcome member
        // without handling it here becomes a type error, not a silent miscount.
        const _exhaustive: never = outcome;
        return _exhaustive;
      }
    }
  }
  return tally;
}
