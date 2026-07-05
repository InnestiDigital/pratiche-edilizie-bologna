/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * notification-routing.ts imports expo-notifications, which has no tap-response
 * surface in a screenshot build. There are no notifications on web, so both
 * entry points are inert. Native uses notification-routing.ts. Keep this export
 * surface in sync with the native module (tsc guards drift).
 */
import type { NotificationRoute } from './notification-link';

export function subscribeNotificationResponses(
  _onRoute: (route: NotificationRoute) => void
): () => void {
  return () => {
    // no-op on web
  };
}

export async function getInitialNotificationRoute(): Promise<NotificationRoute | null> {
  return null;
}
