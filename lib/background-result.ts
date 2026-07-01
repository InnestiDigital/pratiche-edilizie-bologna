import type { SyncResult } from './sync';

/**
 * Pure summary of a background-sync pass. Kept free of expo-background-fetch /
 * TaskManager so the "did anything change, and by how much" decision that drives
 * the background notification is unit-testable without booting native modules.
 *
 * `hasChanges` is the single source of truth for whether the background task
 * should fire a notification and report NewData vs NoData.
 */
export interface BackgroundSyncSummary {
  totalNew: number;
  totalUpdated: number;
  hasChanges: boolean;
}

/**
 * Sum the per-dataset insert/update counts of a sync pass into one summary.
 *
 * Per-dataset counters that are missing, negative, or non-finite are treated as
 * 0 so a malformed result can never inflate the notification count or trigger a
 * spurious notification.
 */
export function summarizeSyncResults(results: readonly SyncResult[]): BackgroundSyncSummary {
  let totalNew = 0;
  let totalUpdated = 0;

  for (const r of results) {
    totalNew += sanitizeCount(r.inserted);
    totalUpdated += sanitizeCount(r.updated);
  }

  return {
    totalNew,
    totalUpdated,
    hasChanges: totalNew > 0 || totalUpdated > 0,
  };
}

function sanitizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
