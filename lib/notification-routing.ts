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
 */
export function subscribeNotificationResponses(
  onRoute: (route: NotificationRoute) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onRoute(notificationRoute(response.notification.request.content.data));
  });
  return () => sub.remove();
}

export async function getInitialNotificationRoute(): Promise<NotificationRoute | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  return notificationRoute(response.notification.request.content.data);
}
