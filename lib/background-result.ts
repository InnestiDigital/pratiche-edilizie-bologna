import type { SyncResult } from './sync';
import { CATEGORIES, type Category } from './sources';

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
  /**
   * New-permit count per category (categories with 0 new omitted). Drives the
   * category-aware notification body (`notification-message.ts`). Never affects
   * `hasChanges` — a result whose `category` is missing/invalid still folds into
   * `totalNew`/`totalUpdated`, it just does not get a per-category line.
   */
  newByCategory: Partial<Record<Category, number>>;
  hasChanges: boolean;
}

/**
 * Sum the per-source insert/update counts of a sync pass into one summary.
 *
 * Per-source counters that are missing, negative, or non-finite are treated as
 * 0 so a malformed result can never inflate the notification count or trigger a
 * spurious notification. A result carrying an unrecognized `category` still
 * contributes to the totals (so nothing is silently lost) but is left out of
 * `newByCategory`, which the message builder falls back from gracefully.
 */
export function summarizeSyncResults(results: readonly SyncResult[]): BackgroundSyncSummary {
  let totalNew = 0;
  let totalUpdated = 0;
  const newByCategory: Partial<Record<Category, number>> = {};

  for (const r of results) {
    const inserted = sanitizeCount(r.inserted);
    totalNew += inserted;
    totalUpdated += sanitizeCount(r.updated);

    if (inserted > 0 && isCategory(r.category)) {
      newByCategory[r.category] = (newByCategory[r.category] ?? 0) + inserted;
    }
  }

  return {
    totalNew,
    totalUpdated,
    newByCategory,
    hasChanges: totalNew > 0 || totalUpdated > 0,
  };
}

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function sanitizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
