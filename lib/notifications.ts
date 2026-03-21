import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function hasNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

export async function sendNewPermitsNotification(
  newCount: number,
  updatedCount: number,
): Promise<void> {
  if (newCount === 0 && updatedCount === 0) return;

  const parts: string[] = [];
  if (newCount > 0) {
    parts.push(`${newCount} nuov${newCount === 1 ? "a pratica" : "e pratiche"}`);
  }
  if (updatedCount > 0) {
    parts.push(`${updatedCount} aggiornat${updatedCount === 1 ? "a" : "e"}`);
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Pratiche Edilizie Bologna",
      body: parts.join(", "),
      data: { screen: "/(tabs)" },
      ...(Platform.OS === "android" && {
        categoryIdentifier: "new-permits",
      }),
    },
    trigger: null, // fire immediately
  });
}
