import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { buildNotificationMessage } from './notification-message';

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

export async function sendNewPermitsNotification(
  newCount: number,
  updatedCount: number
): Promise<void> {
  const body = buildNotificationMessage(newCount, updatedCount);
  if (body === null) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Pratiche Edilizie Bologna',
      body,
      data: { screen: '/(tabs)' },
      ...(Platform.OS === 'android' && {
        categoryIdentifier: 'new-permits',
      }),
    },
    trigger: null, // fire immediately
  });
}
