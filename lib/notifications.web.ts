/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * `notifications.ts` imports `expo-notifications` (native-only). The screenshot
 * build never sends a notification, so permission checks resolve false and the
 * send is a no-op. Native uses `notifications.ts`.
 */
import type { BackgroundSyncSummary } from './background-result';

export async function requestNotificationPermissions(): Promise<boolean> {
  return false;
}

export async function hasNotificationPermissions(): Promise<boolean> {
  return false;
}

export async function sendNewPermitsNotification(_summary: BackgroundSyncSummary): Promise<void> {
  // no-op on web
}
