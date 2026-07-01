/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * `sync.ts` imports `expo-sqlite` (which breaks the web bundle) and hits the
 * Bologna network. For screenshots we neither sync nor talk to the network:
 * report an already-synced state. Native + vitest use `sync.ts`.
 */
import { LAST_SYNC_FIXTURE } from './screenshot-fixtures';

export interface SyncResult {
  dataset: string;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

const NOOP_RESULTS: SyncResult[] = [
  { dataset: 'pdc', fetched: 0, inserted: 0, updated: 0 },
  { dataset: 'scia', fetched: 0, inserted: 0, updated: 0 },
  { dataset: 'cila', fetched: 0, inserted: 0, updated: 0 },
];

export function syncRecent(_onProgress?: (msg: string) => void): Promise<SyncResult[]> {
  return Promise.resolve(NOOP_RESULTS);
}

export function syncFull(_onProgress?: (msg: string) => void): Promise<SyncResult[]> {
  return Promise.resolve(NOOP_RESULTS);
}

export async function getLastSyncTime(): Promise<string | null> {
  return LAST_SYNC_FIXTURE;
}
