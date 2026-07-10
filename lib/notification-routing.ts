import * as Notifications from 'expo-notifications';
import { notificationRoute, type NotificationRoute } from './notification-link';

/**
 * Native glue: turn a tapped local notification into a feed route.
 *
 * `subscribeNotificationResponses` wires the OS "user tapped a notification"
 * event for taps while the app is running; `getInitialNotificationRoute` covers
 * the cold-start case (the tap that launched the app). Both funnel the
 * notification's `data` payload through the pure `notificationRoute()` decision,
 * so the "where does a tap go" logic stays testable and this module is only the
 * thin expo-notifications binding. Web has no notification taps →
 * notification-routing.web.ts no-ops both entry points.
 *
 * Consume-once: `getLastNotificationResponseAsync()` persists the last tapped
 * response across launches, so without a guard a *normal* icon cold-launch that
 * merely follows an earlier tap would re-route the feed (e.g. re-open it filtered
 * to "Solo nuovi"). Both entry points therefore call
 * `clearLastNotificationResponseAsync()` after routing a response, so a given tap
 * launches its route exactly once. The clear is best-effort — a failure at worst
 * re-routes on the next launch — and is surfaced (warn), never silently swallowed.
 */
function clearConsumedResponse(): void {
  Notifications.clearLastNotificationResponseAsync().catch((err: unknown) => {
    console.warn('clearLastNotificationResponseAsync failed', err);
  });
}

export function subscribeNotificationResponses(
  onRoute: (route: NotificationRoute) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onRoute(notificationRoute(response.notification.request.content.data));
    clearConsumedResponse();
  });
  return () => sub.remove();
}

export async function getInitialNotificationRoute(): Promise<NotificationRoute | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  const route = notificationRoute(response.notification.request.content.data);
  clearConsumedResponse();
  return route;
}
