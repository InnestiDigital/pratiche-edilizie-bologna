import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { syncRecent } from './sync';
import { sendNewPermitsNotification, hasNotificationPermissions } from './notifications';
import { getDb, getPreference } from './db';
import { summarizeSyncResults } from './background-result';
import { loadPreferences } from './preferences';
import { chooseNotificationBody, type NearHomeCandidate } from './home-alert';
import { getCoords } from './permit-extra';

const TASK_NAME = 'background-permit-sync';

// Define the background task
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    // Check if notifications are enabled in user preferences
    const db = await getDb();
    const enabled = await getPreference(db, 'notifications_enabled', 'false');
    if (enabled !== 'true') {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Check if we have notification permissions
    const hasPerms = await hasNotificationPermissions();
    if (!hasPerms) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Run sync, scoped to the categories the user opted into — a user who turned
    // a category off must not pay for its (potentially 100k-row) download. Stamp
    // the run start FIRST so the newly-inserted rows can be isolated by
    // `first_seen_at` for the place-aware alert below.
    const { interests, home, homeRadiusMeters } = await loadPreferences();
    const runStartedAt = new Date().toISOString();
    const results = await syncRecent(undefined, interests);

    const summary = summarizeSyncResults(results);

    if (!summary.hasChanges) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Place-aware alert (P4): when a home is set and rows were genuinely inserted
    // this run, read those rows' coordinates so the notification can say "N
    // pratiche vicino a casa". Rows inserted this run carry `first_seen_at >=`
    // the pre-sync stamp; their coord lives in `extra` (getCoords → null when a
    // row has none). The decision — targeted vs generic body — is delegated to
    // the pure `chooseNotificationBody`.
    let candidates: NearHomeCandidate[] = [];
    if (home !== null && summary.totalNew > 0) {
      const newRows = await db.getAllAsync<{ extra: string }>(
        'SELECT extra FROM permits WHERE first_seen_at >= ?',
        runStartedAt
      );
      candidates = newRows.map((r) => ({ coords: getCoords(r.extra) }));
    }

    const body = chooseNotificationBody(home, homeRadiusMeters, candidates, summary);
    await sendNewPermitsNotification(summary, body);
    return BackgroundFetch.BackgroundFetchResult.NewData;
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
