import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { buildNotificationMessage } from './notification-message';
import { buildNotificationData } from './notification-link';
import type { BackgroundSyncSummary } from './background-result';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function hasNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function sendNewPermitsNotification(summary: BackgroundSyncSummary): Promise<void> {
  const body = buildNotificationMessage(summary);
  if (body === null) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Pratiche Edilizie Bologna',
      body,
      // `new: '1'` when the sync brought genuinely-new permits → tapping the
      // notification deep-links the feed to its "Solo nuovi" filter (consumed by
      // notification-routing → app/_layout). Update-only → plain feed.
      data: buildNotificationData(summary.totalNew),
      ...(Platform.OS === 'android' && {
        categoryIdentifier: 'new-permits',
      }),
    },
    trigger: null, // fire immediately
  });
}
