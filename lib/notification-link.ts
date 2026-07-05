// Deep-link payload + routing for the local "new permits" notification.
//
// Pure (no expo / react-native imports) so both the builder (what `data` to
// attach when scheduling the notification) and the parser (where a tapped
// notification routes) are unit-tested under plain node. The native glue that
// actually listens for a tap lives in notification-routing.ts (web-shimmed);
// it delegates the "where do I go" decision to notificationRoute() here, so the
// routing logic stays testable and the binding module stays thin.

/** The feed route, optionally pre-filtered to "Solo nuovi". */
export interface NotificationRoute {
  pathname: '/(tabs)';
  params: { new?: '1' };
}

/**
 * The `data` payload attached to a scheduled notification. The open index
 * signature makes it assignable to expo-notifications' `Record<string, unknown>`
 * content `data` field.
 */
export interface NotificationData {
  screen: '/(tabs)';
  /** '1' only when the sync brought genuinely-new permits (see buildNotificationData). */
  new?: '1';
  [key: string]: unknown;
}

/**
 * Build the `data` payload attached to the scheduled notification. `new: '1'`
 * is set only when the sync brought genuinely-new permits, so tapping the
 * notification deep-links the feed straight to its "Solo nuovi" filter; an
 * update-only notification (nothing genuinely new) just opens the feed
 * unfiltered. Non-positive / non-finite / fractional counts are treated as
 * "nothing new" defensively, matching notification-message's safeCount.
 */
export function buildNotificationData(newCount: number): NotificationData {
  const hasNew = Number.isFinite(newCount) && newCount >= 1;
  return hasNew ? { screen: '/(tabs)', new: '1' } : { screen: '/(tabs)' };
}

/**
 * Map an arbitrary notification `data` payload (typed `unknown` — it round-trips
 * through the OS and could be legacy `{ screen }`, malformed, or absent) to a
 * feed route. Only a payload that explicitly carries `new: '1'` opens the "Solo
 * nuovi" feed; every other shape falls back to the plain feed, so a tapped
 * notification always lands somewhere valid rather than nowhere.
 */
export function notificationRoute(data: unknown): NotificationRoute {
  if (typeof data === 'object' && data !== null && 'new' in data && data.new === '1') {
    return { pathname: '/(tabs)', params: { new: '1' } };
  }
  return { pathname: '/(tabs)', params: {} };
}
