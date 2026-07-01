/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * `background-sync.ts` imports `expo-task-manager` + `expo-background-fetch`,
 * neither of which exists on web. There is no background sync in a screenshot
 * build, so every entry point is a no-op. Native uses `background-sync.ts`.
 */
export async function registerBackgroundSync(): Promise<void> {
  // no-op on web
}

export async function unregisterBackgroundSync(): Promise<void> {
  // no-op on web
}

export async function isBackgroundSyncRegistered(): Promise<boolean> {
  return false;
}
