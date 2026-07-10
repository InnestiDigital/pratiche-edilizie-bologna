/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * Returns a fixed "already onboarded" preference set so the web export lands on
 * the populated feed (the real `preferences.ts` reads SQLite via `getDb`, absent
 * on web). Writes are no-ops. Native + vitest use `preferences.ts`.
 */
import { QUARTIERI, FILING_TYPE_ORDER, type FilingType, type Quartiere } from './constants';
import { CATEGORIES, type Category } from './sources';
import { DEFAULT_HOME_RADIUS_M, type HomeLocation } from './home-location';

export interface UserPreferences {
  zones: Quartiere[];
  filingTypes: FilingType[];
  interests: Category[];
  tags: string[];
  onboardingDone: boolean;
  home: HomeLocation | null;
  homeRadiusMeters: number;
  homeHintDismissed: boolean;
}

const FIXTURE: UserPreferences = {
  zones: [...QUARTIERI],
  filingTypes: [...FILING_TYPE_ORDER],
  interests: [...CATEGORIES],
  tags: [],
  onboardingDone: true,
  // Anchored on the Navile cantiere cluster (screenshot-fixtures ids 9/13/14), so
  // the Settings "Casa" card renders set + the feed "Vicino a casa" filter has a
  // real neighbourhood to narrow to in the web screenshot build.
  home: { coords: { lat: 44.5236, lon: 11.361 }, label: 'Via Stalingrado 45' },
  homeRadiusMeters: DEFAULT_HOME_RADIUS_M,
  // Home is set in the fixture, so the feed hint is (correctly) suppressed in the
  // default screenshot; the value only matters when the fixture home is null.
  homeHintDismissed: false,
};

export async function loadPreferences(): Promise<UserPreferences> {
  return { ...FIXTURE };
}

export async function isOnboardingDone(): Promise<boolean> {
  return true;
}

export async function completeOnboarding(
  _prefs: Pick<UserPreferences, 'zones' | 'filingTypes' | 'interests'>
): Promise<void> {
  // no-op on web
}

export async function isNotificationsEnabled(): Promise<boolean> {
  // On in the fixture: it is the app's advertised default and it makes the
  // place-aware alert caption (Settings "Casa", home set + notifications on)
  // render in the screenshot so the P4 radius alert is visually verifiable.
  return true;
}

export async function setNotificationsEnabled(_enabled: boolean): Promise<void> {
  // no-op on web
}

export async function savePreferences(_prefs: Partial<UserPreferences>): Promise<void> {
  // no-op on web
}
