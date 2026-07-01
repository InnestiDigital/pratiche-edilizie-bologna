/**
 * WEB SCREENSHOT SHIM — resolved by Metro only for the web platform.
 *
 * Returns a fixed "already onboarded" preference set so the web export lands on
 * the populated feed (the real `preferences.ts` reads SQLite via `getDb`, absent
 * on web). Writes are no-ops. Native + vitest use `preferences.ts`.
 */
import { QUARTIERI, FILING_TYPE_ORDER, type FilingType, type Quartiere } from './constants';

export interface UserPreferences {
  zones: Quartiere[];
  filingTypes: FilingType[];
  tags: string[];
  onboardingDone: boolean;
}

const FIXTURE: UserPreferences = {
  zones: [...QUARTIERI],
  filingTypes: [...FILING_TYPE_ORDER],
  tags: [],
  onboardingDone: true,
};

export async function loadPreferences(): Promise<UserPreferences> {
  return { ...FIXTURE };
}

export async function isOnboardingDone(): Promise<boolean> {
  return true;
}

export async function completeOnboarding(
  _prefs: Pick<UserPreferences, 'zones' | 'filingTypes'>
): Promise<void> {
  // no-op on web
}

export async function isNotificationsEnabled(): Promise<boolean> {
  return false;
}

export async function setNotificationsEnabled(_enabled: boolean): Promise<void> {
  // no-op on web
}

export async function savePreferences(_prefs: Partial<UserPreferences>): Promise<void> {
  // no-op on web
}
