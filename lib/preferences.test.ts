import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SQLite from 'expo-sqlite';
import { QUARTIERI, FILING_TYPE_ORDER } from './constants';
import { CATEGORIES } from './sources';

/**
 * `preferences.ts` reaches for the SQLite singleton via `getDb()` — mock the
 * whole module (same pattern as `sync.test.ts`) so `loadPreferences` can be
 * exercised without `expo-sqlite`. `makeFakeDb` backs `getPreference`/
 * `setPreference` with a plain in-memory `key -> value` map, mirroring the real
 * `preferences` table.
 */
vi.mock('./db', () => ({
  getDb: () => Promise.resolve(currentDb),
  getPreference: (db: { store: Map<string, string> }, key: string, defaultValue: string) =>
    Promise.resolve(db.store.get(key) ?? defaultValue),
  setPreference: (db: { store: Map<string, string> }, key: string, value: string) => {
    db.store.set(key, value);
    return Promise.resolve();
  },
}));

let currentDb: SQLite.SQLiteDatabase;

function useFakeDb(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  // Single documented cast at the fake-db boundary, mirroring sync.test.ts.
  currentDb = { store } as unknown as SQLite.SQLiteDatabase;
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadPreferences — interests default', () => {
  it('defaults interests to edilizia-only when no pref has ever been stored (v1.1.2 upgrader)', async () => {
    // A v1.1.2 upgrader has no stored `interests` key at all. The default must
    // reproduce their exact pre-upgrade behavior (edilizia-only background sync)
    // — defaulting to every category would blow the iOS background-fetch budget
    // on their very first tick after upgrading. New users always write an
    // explicit `interests` set from onboarding, so they never hit this path.
    useFakeDb();
    const { loadPreferences } = await import('./preferences');

    const prefs = await loadPreferences();

    expect(prefs.interests).toEqual(['edilizia']);
  });

  it('does not fall back when a real interests pref (including all categories) is stored', async () => {
    useFakeDb({ interests: JSON.stringify(CATEGORIES) });
    const { loadPreferences } = await import('./preferences');

    const prefs = await loadPreferences();

    expect(prefs.interests).toEqual([...CATEGORIES]);
  });

  it('degrades a corrupt stored interests value to the same edilizia-only default', async () => {
    // decodeEnumArray's fallback for a corrupt/unparseable stored value is the
    // same conservative default as the missing-key case, not "everything".
    useFakeDb({ interests: '{not json' });
    const { loadPreferences } = await import('./preferences');

    const prefs = await loadPreferences();

    expect(prefs.interests).toEqual(['edilizia']);
  });

  it('preserves an explicit empty interests array (user opted out of every category)', async () => {
    useFakeDb({ interests: '[]' });
    const { loadPreferences } = await import('./preferences');

    const prefs = await loadPreferences();

    expect(prefs.interests).toEqual([]);
  });
});

describe('loadPreferences — other defaults unaffected', () => {
  it('still defaults zones/filingTypes to "everything" and onboardingDone to false', async () => {
    useFakeDb();
    const { loadPreferences } = await import('./preferences');

    const prefs = await loadPreferences();

    expect(prefs.zones).toEqual([...QUARTIERI]);
    expect(prefs.filingTypes).toEqual([...FILING_TYPE_ORDER]);
    expect(prefs.tags).toEqual([]);
    expect(prefs.onboardingDone).toBe(false);
  });
});
