/**
 * The "Novità" activity-feed core — the single, pure source of truth for the
 * chronological "what moved on the voci you follow" list.
 *
 * The app already persists two orthogonal "why revisit this?" signals on a permit:
 *   - `is_new` — the row was first seen on the latest sync (a NUOVO arrival);
 *   - `previous_status` / `status_changed_at` — a permit the resident was already
 *     following whose status MOVED (the "cosa è cambiato" transition, written by
 *     the upsert path via `statusTransitionWrite`).
 * Until now each surfaced only as a per-card pill scattered through the feed. This
 * module folds both into ONE ordered activity list so a dedicated screen can be a
 * first-class destination for "what changed since I last looked", turning the two
 * persisted signals into a place to go rather than pills to stumble on.
 *
 * Pure + generic (imports nothing native), so it is unit-testable and the screen
 * can pass full `Permit` rows and get them back untouched inside each entry.
 */

/** The minimal permit shape the activity feed classifies + orders on. */
export interface ActivityInput {
  id: number;
  status: string;
  previous_status: string | null;
  status_changed_at: string | null;
  is_new: number;
  first_seen_at: string;
}

/** How a voce earned its place in the feed: it MOVED (status flip) or ARRIVED. */
export type ActivityKind = 'transition' | 'new';

export interface ActivityEntry<T extends ActivityInput> {
  permit: T;
  kind: ActivityKind;
  /** ISO instant this entry is ordered by, newest first: the status-flip time for
   *  a transition (falling back to first-seen if the flip is unstamped), else the
   *  arrival time. */
  at: string;
}

/**
 * Whether a permit carries a real, persisted status transition worth surfacing.
 *
 * Mirrors `statusChangeLine`'s guard exactly (absent/empty previous status, or a
 * no-op `previous === current`, is not a transition) so the activity feed and the
 * per-card "cosa è cambiato" line can never disagree about what counts as moved.
 */
function hasTransition(p: ActivityInput): boolean {
  return p.previous_status != null && p.previous_status !== '' && p.previous_status !== p.status;
}

/**
 * Build the ordered activity feed from the candidate rows (those flagged new or
 * carrying a persisted transition — see `getActivityPermits`). Each row becomes at
 * most one entry: a transition is the richer "why revisit" signal, so it wins even
 * when the same row is also flagged new. Ordered newest-change-first, with a stable
 * `id`-descending tiebreak so two same-instant entries render deterministically
 * (and identically under vitest and on device).
 */
export function buildActivityFeed<T extends ActivityInput>(permits: T[]): ActivityEntry<T>[] {
  const entries: ActivityEntry<T>[] = [];
  for (const p of permits) {
    if (hasTransition(p)) {
      entries.push({ permit: p, kind: 'transition', at: p.status_changed_at ?? p.first_seen_at });
    } else if (p.is_new === 1) {
      entries.push({ permit: p, kind: 'new', at: p.first_seen_at });
    }
  }
  return entries.sort((a, b) => (a.at === b.at ? b.permit.id - a.permit.id : a.at < b.at ? 1 : -1));
}

/**
 * Count of voci that would appear in the activity feed — drives the feed's entry
 * badge. Applies the same `hasTransition` / `is_new` predicate as
 * `buildActivityFeed`, so the badge count and the destination's length agree.
 */
export function activityCount(permits: ActivityInput[]): number {
  let n = 0;
  for (const p of permits) if (hasTransition(p) || p.is_new === 1) n++;
  return n;
}
