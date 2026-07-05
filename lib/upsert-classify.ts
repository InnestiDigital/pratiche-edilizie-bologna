/**
 * Pure classification of a permit upsert into its outcome.
 *
 * The sync loop reports how many permits are `inserted` / `updated` per dataset,
 * and those counts drive the "new permits" push notification. Getting the
 * classification wrong inflates the notification count (users pinged about
 * permits that were not actually new), so the decision is isolated here and
 * exhaustively tested rather than tangled into the DB-effect code in `sync.ts`.
 */

import type { NormalizedPermit } from './normalize';

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged';

/**
 * Every mutable content column an upsert may rewrite. Single source of truth:
 * `classifyUpsert` compares these, and `sync.ts` derives its existing-row SELECT
 * and its UPDATE SET list from this same array, so the three cannot drift.
 *
 * Identity columns (`dataset`, `source_id`, `filing_type`, `category`) and
 * app-side state (`first_seen_at`, `is_new`) are deliberately excluded: they are
 * never rewritten by an update and must not count as a change.
 *
 * Detecting a change on ANY of these (not just `status`) is what lets a
 * rescheduled event, a corrected address/zone/link, or a re-derived tag set
 * actually heal on-device — a status-only comparison left every non-status
 * correction (and every eventi/segnalazioni row, whose status is a constant)
 * permanently stale.
 */
export const PERMIT_CONTENT_FIELDS = [
  'source_updated_at',
  'address',
  'zone',
  'codvia',
  'procedimento',
  'date_issued',
  'status',
  'status_raw',
  'tags',
  'source_link',
  'title',
  'extra',
] as const;

/** The subset of a normalized permit whose content an upsert compares/rewrites. */
export type PermitContent = Pick<NormalizedPermit, (typeof PERMIT_CONTENT_FIELDS)[number]>;

/**
 * Decide the outcome of upserting one permit.
 *
 * @param existing       the stored content for this `source_id`, or `null` if the
 *                       pre-insert lookup found nothing.
 * @param incoming       the permit just fetched + normalized from open data.
 * @param insertChanges  rows affected by the `INSERT OR IGNORE` — only meaningful
 *                       when `existing === null`. `0` means the insert was ignored
 *                       because another writer had already inserted this
 *                       `source_id` between the lookup and the insert, so the
 *                       permit is NOT new to us.
 *
 * Rules:
 * - No existing row + insert actually happened (`insertChanges > 0`) → `inserted`.
 * - No existing row + insert ignored (`insertChanges <= 0`) → `unchanged`
 *   (a raced duplicate; counting it as new would over-report).
 * - Existing row differing on ANY content field → `updated`.
 * - Existing row identical on every content field → `unchanged`.
 *
 * Comparison is per-field strict `!==` (values are `string | number | null`).
 * `tags`/`extra` are JSON strings compared as strings; every normalizer builds
 * them deterministically (fixed-order slots / insertion-ordered object), so an
 * unchanged upstream record re-serializes byte-identically — no false `updated`.
 */
export function classifyUpsert(
  existing: PermitContent | null,
  incoming: PermitContent,
  insertChanges: number
): UpsertOutcome {
  if (existing === null) {
    return insertChanges > 0 ? 'inserted' : 'unchanged';
  }
  return PERMIT_CONTENT_FIELDS.some((f) => existing[f] !== incoming[f]) ? 'updated' : 'unchanged';
}
