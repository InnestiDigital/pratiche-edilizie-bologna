// Pure core for the P4 place-aware background alert (docs/P4-map-radius.md §5 —
// the notification half of "vicino a casa"): when the user has anchored a home,
// the background sync's "N nuove pratiche" notification becomes targeted — "N
// pratiche vicino a casa" — counting only the freshly-synced rows within the
// chosen radius of home, and falling back to the generic per-category body when
// no home is set (or nothing new landed near it).
//
// Everything decidable lives here (the near-home count over already-read rows,
// the Italian plural body, the generic-vs-targeted choice) so it is unit-testable
// under plain node; the device-coupled half (background-sync.ts) only reads the
// newly-inserted rows out of SQLite and hands them here.

import type { Coords } from './permit-extra';
import type { HomeLocation } from './home-location';
import { filterPermitsNearHome } from './home-location';
import { buildNotificationMessage, type NotificationSummary } from './notification-message';

/**
 * A freshly-synced row reduced to what the near-home decision needs: its
 * coordinate, or `null` when it carries none (a not-yet-geocoded edilizia row,
 * or a source without a coordinate). A `null`-coord row can't be asserted near
 * home, so it never counts toward the alert.
 */
export interface NearHomeCandidate {
  coords: Coords | null;
}

/** Clamp to a non-negative integer (NaN / negative / fractional → floored). */
function safeCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Count the freshly-synced rows within `radiusMeters` of home. Returns 0 when no
 * home is set; rows without a coordinate are excluded (delegated to the tested
 * `filterPermitsNearHome` → `geo-radius` haversine, which drops `null` coords).
 */
export function countNearHome(
  home: HomeLocation | null,
  radiusMeters: number,
  candidates: readonly NearHomeCandidate[]
): number {
  if (home === null) return 0;
  return filterPermitsNearHome(home, radiusMeters, candidates, (c) => c.coords).length;
}

/**
 * Italian-plural body for the near-home alert: "1 pratica vicino a casa" /
 * "N pratiche vicino a casa". `null` when nothing is near (so the caller falls
 * back to the generic body). "pratiche" is the app's established generic noun
 * for a civic record (the same DEFAULT_CATEGORY term the generic builder falls
 * back to), read here as "records near home" across all five categories.
 */
export function buildNearHomeBody(count: number): string | null {
  const n = safeCount(count);
  if (n === 0) return null;
  return n === 1 ? '1 pratica vicino a casa' : `${n} pratiche vicino a casa`;
}

/**
 * Choose the background-notification body. When a home is set AND at least one
 * freshly-synced row is within the radius, the body is the place-aware "N
 * pratiche vicino a casa"; otherwise it is the generic per-category body from
 * {@link buildNotificationMessage} (which itself returns `null` when there is
 * nothing worth notifying about, so a no-op sync still pings nobody).
 *
 * The near-home path never suppresses the generic notification: a home set with
 * no new rows nearby still surfaces the generic "N nuove pratiche" so the user
 * doesn't silently miss civic activity elsewhere in the city.
 */
export function chooseNotificationBody(
  home: HomeLocation | null,
  radiusMeters: number,
  candidates: readonly NearHomeCandidate[],
  summary: NotificationSummary
): string | null {
  const near = buildNearHomeBody(countNearHome(home, radiusMeters, candidates));
  if (near !== null) return near;
  return buildNotificationMessage(summary);
}
