/**
 * Pure classification of a permit upsert into its outcome.
 *
 * The sync loop reports how many permits are `inserted` / `updated` per dataset,
 * and those counts drive the "new permits" push notification. Getting the
 * classification wrong inflates the notification count (users pinged about
 * permits that were not actually new), so the decision is isolated here and
 * exhaustively tested rather than tangled into the DB-effect code in `sync.ts`.
 */

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged';

/**
 * Decide the outcome of upserting one permit.
 *
 * @param existing        the row already stored for this `source_id`, or `null`
 *                        if the pre-insert lookup found nothing.
 * @param incomingStatus  the status of the permit just fetched from open data.
 * @param insertChanges   rows affected by the `INSERT OR IGNORE` — only
 *                        meaningful when `existing === null`. `0` means the
 *                        insert was ignored because another writer had already
 *                        inserted this `source_id` between the lookup and the
 *                        insert, so the permit is NOT new to us.
 *
 * Rules:
 * - No existing row + insert actually happened (`insertChanges > 0`) → `inserted`.
 * - No existing row + insert ignored (`insertChanges <= 0`) → `unchanged`
 *   (a raced duplicate; counting it as new would over-report).
 * - Existing row with a different status → `updated`.
 * - Existing row with the same status → `unchanged`.
 */
export function classifyUpsert(
  existing: { status: string } | null,
  incomingStatus: string,
  insertChanges: number
): UpsertOutcome {
  if (existing === null) {
    return insertChanges > 0 ? 'inserted' : 'unchanged';
  }
  return existing.status !== incomingStatus ? 'updated' : 'unchanged';
}
