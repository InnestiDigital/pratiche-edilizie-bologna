import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { syncRecent } from "./sync";
import { sendNewPermitsNotification, hasNotificationPermissions } from "./notifications";
import { getDb, getPreference } from "./db";

const TASK_NAME = "background-permit-sync";

// Define the background task
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    // Check if notifications are enabled in user preferences
    const db = await getDb();
    const enabled = await getPreference(db, "notifications_enabled", "false");
    if (enabled !== "true") {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Check if we have notification permissions
    const hasPerms = await hasNotificationPermissions();
    if (!hasPerms) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Run sync
    const results = await syncRecent();

    const totalNew = results.reduce((sum, r) => sum + r.inserted, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);

    if (totalNew > 0 || totalUpdated > 0) {
      await sendNewPermitsNotification(totalNew, totalUpdated);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(TASK_NAME, {
    minimumInterval: 60 * 60, // 1 hour minimum
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unregisterBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!isRegistered) return;

  await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
}

export async function isBackgroundSyncRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(TASK_NAME);
}
