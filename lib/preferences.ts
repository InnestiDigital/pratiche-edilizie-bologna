import { getDb, getPreference, setPreference } from './db';
import { QUARTIERI, FILING_TYPE_ORDER, type FilingType, type Quartiere } from './constants';
import { CATEGORIES, type Category } from './sources';
import { decodeStringArray, decodeEnumArray } from './preferences-decode';
import {
  parseStoredHome,
  serializeHome,
  sanitizeHomeRadius,
  DEFAULT_HOME_RADIUS_M,
  type HomeLocation,
} from './home-location';

export interface UserPreferences {
  zones: Quartiere[];
  filingTypes: FilingType[];
  interests: Category[];
  tags: string[];
  onboardingDone: boolean;
  /** The user's home anchor for the "Vicino a casa" feed radius filter, or null. */
  home: HomeLocation | null;
  /** Chosen radius (metres) for that filter; snapped to a valid option on read. */
  homeRadiusMeters: number;
}

const DEFAULTS: UserPreferences = {
  zones: [...QUARTIERI],
  filingTypes: [...FILING_TYPE_ORDER],
  // Deliberately NOT all categories: a v1.1.2 upgrader has no stored `interests`
  // key, so this fallback must reproduce their exact pre-upgrade behavior —
  // edilizia-only background + manual sync. Downloading commercio + segnalazioni
  // (hundreds of sequential requests) under the silent default would blow the iOS
  // ~30s background-fetch budget on every tick. New users always write an explicit
  // interests set from onboarding, so they never hit this default. Note this same
  // value is also the decode fallback for a corrupt stored pref (line below,
  // third arg to decodeEnumArray) — a corrupt-pref user degrades to edilizia-only,
  // the conservative choice. CATEGORIES stays imported: it is the allowed-value
  // list decodeEnumArray validates against.
  interests: ['edilizia'],
  tags: [],
  onboardingDone: false,
  home: null,
  homeRadiusMeters: DEFAULT_HOME_RADIUS_M,
};

export async function loadPreferences(): Promise<UserPreferences> {
  const db = await getDb();
  const zones = await getPreference(db, 'zones', JSON.stringify(DEFAULTS.zones));
  const filingTypes = await getPreference(db, 'filing_types', JSON.stringify(DEFAULTS.filingTypes));
  const interests = await getPreference(db, 'interests', JSON.stringify(DEFAULTS.interests));
  const tags = await getPreference(db, 'tags', JSON.stringify(DEFAULTS.tags));
  const onboarding = await getPreference(db, 'onboarding_done', 'false');
  const home = await getPreference(db, 'home', 'null');
  const homeRadius = await getPreference(db, 'home_radius_m', String(DEFAULTS.homeRadiusMeters));

  return {
    zones: decodeEnumArray(zones, QUARTIERI, DEFAULTS.zones),
    filingTypes: decodeEnumArray(filingTypes, FILING_TYPE_ORDER, DEFAULTS.filingTypes),
    interests: decodeEnumArray(interests, CATEGORIES, DEFAULTS.interests),
    tags: decodeStringArray(tags, DEFAULTS.tags),
    onboardingDone: onboarding === 'true',
    // parseStoredHome hardens against a corrupt/legacy value (→ null); the radius
    // is snapped to a valid option so a stale/garbage number can't skew the filter.
    home: parseStoredHome(home),
    homeRadiusMeters: sanitizeHomeRadius(Number(homeRadius)),
  };
}

export async function isOnboardingDone(): Promise<boolean> {
  const db = await getDb();
  const val = await getPreference(db, 'onboarding_done', 'false');
  return val === 'true';
}

export async function completeOnboarding(
  prefs: Pick<UserPreferences, 'zones' | 'filingTypes' | 'interests'>
): Promise<void> {
  await savePreferences({ ...prefs, onboardingDone: true });
}

export async function isNotificationsEnabled(): Promise<boolean> {
  const db = await getDb();
  const val = await getPreference(db, 'notifications_enabled', 'false');
  return val === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  const db = await getDb();
  await setPreference(db, 'notifications_enabled', String(enabled));
}

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  const db = await getDb();
  if (prefs.zones !== undefined) {
    await setPreference(db, 'zones', JSON.stringify(prefs.zones));
  }
  if (prefs.filingTypes !== undefined) {
    await setPreference(db, 'filing_types', JSON.stringify(prefs.filingTypes));
  }
  if (prefs.interests !== undefined) {
    await setPreference(db, 'interests', JSON.stringify(prefs.interests));
  }
  if (prefs.tags !== undefined) {
    await setPreference(db, 'tags', JSON.stringify(prefs.tags));
  }
  if (prefs.onboardingDone !== undefined) {
    await setPreference(db, 'onboarding_done', String(prefs.onboardingDone));
  }
  // `home: null` is a real value (clear the anchor) — serializeHome maps it to the
  // literal 'null' string, distinct from the `undefined` "field not being saved".
  if (prefs.home !== undefined) {
    await setPreference(db, 'home', serializeHome(prefs.home));
  }
  if (prefs.homeRadiusMeters !== undefined) {
    await setPreference(db, 'home_radius_m', String(sanitizeHomeRadius(prefs.homeRadiusMeters)));
  }
}
