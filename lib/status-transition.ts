/**
 * The "cosa è cambiato" core — the single source of truth for BOTH the upsert
 * write ("did this permit's status just move, and from what?") and the read-side
 * render ("show a category-voiced line saying what it moved to/from"), so the two
 * cannot drift.
 *
 * Background: `classifyUpsert` already detects that a stored permit changed on
 * upsert, but it throws the prior state away — nothing persists an "In corso →
 * Conclusa" transition for the user to see. This module supplies the two pure
 * decisions around that gap; `sync.ts` (write) and the feed/detail screens (read)
 * are the thin callers. Imports nothing from `expo-*`, so it is unit-testable.
 *
 * Distinct from the NUOVO badge: NUOVO = the row was first seen / just touched;
 * a status transition = a permit the user was already following moved to a new
 * state. Only the latter answers "why should I revisit this?".
 */

import type { Category } from './sources';
import type { UpsertOutcome } from './upsert-classify';
import { statusLabelFor } from './status-label';

/** The columns an upsert writes to persist a status transition. */
export interface StatusTransitionWrite {
  /** The status the row held before this upsert flipped it. */
  previous_status: string;
  /** ISO timestamp of the flip (the upsert's `now`). */
  status_changed_at: string;
}

/**
 * Decide whether upserting an existing row is a real STATUS transition worth
 * persisting for the "cosa è cambiato" signal.
 *
 * Returns the columns to write (prior status + when) only when the upsert was
 * classified `updated` AND the stored status differs from the incoming one;
 * `null` for a fresh insert, an unchanged row, or a non-status content
 * correction (address/tags/link/…), so a mere data heal never fakes a transition.
 *
 * Category is deliberately not an input: eventi/segnalazioni carry a constant
 * status, so their stored and incoming statuses are always equal and this returns
 * `null` for them without a special case.
 */
export function statusTransitionWrite(
  existingStatus: string,
  incomingStatus: string,
  outcome: UpsertOutcome,
  now: string
): StatusTransitionWrite | null {
  if (outcome !== 'updated') return null;
  if (existingStatus === incomingStatus) return null;
  return { previous_status: existingStatus, status_changed_at: now };
}

/** The category-voiced labels for a transition line ("Ora {current} · era {previous}"). */
export interface StatusChangeLine {
  /** The permit's current status, as its category-correct pill label. */
  current: string;
  /** The status it held before, as its category-correct pill label. */
  previous: string;
}

/**
 * Build the read-side "what changed" line for a followed permit whose status
 * moved. Returns `null` — nothing to show — when the stored `previous_status` is
 * absent (never transitioned, or a legacy/undecoded value) or, defensively, when
 * it equals the current status (a mis-written no-op). Both statuses are rendered
 * through `statusLabelFor`, so the line speaks in the category's own vocabulary
 * and gender ("Ora Conclusa · era Rilasciata"), reusing the existing status-copy
 * matrix rather than a parallel one.
 *
 * Decode-hardened: `previousStatus` is read straight off the SQLite column, so it
 * is typed `string | null | undefined` and any empty/absent value collapses to
 * `null` here instead of rendering a broken "era" with no prior state.
 */
export function statusChangeLine(
  previousStatus: string | null | undefined,
  currentStatus: string,
  category: Category,
  statusRaw: string
): StatusChangeLine | null {
  if (previousStatus == null || previousStatus === '') return null;
  if (previousStatus === currentStatus) return null;
  return {
    current: statusLabelFor(currentStatus, category, statusRaw),
    // The prior status has no stored raw form; fall back to the status token
    // itself, exactly as `statusLabelFor` does for an unknown current status.
    previous: statusLabelFor(previousStatus, category, previousStatus),
  };
}
