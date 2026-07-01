import { getDb, getPreference, setPreference } from "./db";
import { QUARTIERI, FILING_TYPE_ORDER, type FilingType, type Quartiere } from "./constants";
import { decodeStringArray, decodeEnumArray } from "./preferences-decode";

export interface UserPreferences {
  zones: Quartiere[];
  filingTypes: FilingType[];
  tags: string[];
  onboardingDone: boolean;
}

const DEFAULTS: UserPreferences = {
  zones: [...QUARTIERI],
  filingTypes: [...FILING_TYPE_ORDER],
  tags: [],
  onboardingDone: false,
};

export async function loadPreferences(): Promise<UserPreferences> {
  const db = await getDb();
  const zones = await getPreference(db, "zones", JSON.stringify(DEFAULTS.zones));
  const filingTypes = await getPreference(db, "filing_types", JSON.stringify(DEFAULTS.filingTypes));
  const tags = await getPreference(db, "tags", JSON.stringify(DEFAULTS.tags));
  const onboarding = await getPreference(db, "onboarding_done", "false");

  return {
    zones: decodeEnumArray(zones, QUARTIERI, DEFAULTS.zones),
    filingTypes: decodeEnumArray(filingTypes, FILING_TYPE_ORDER, DEFAULTS.filingTypes),
    tags: decodeStringArray(tags, DEFAULTS.tags),
    onboardingDone: onboarding === "true",
  };
}

export async function isOnboardingDone(): Promise<boolean> {
  const db = await getDb();
  const val = await getPreference(db, "onboarding_done", "false");
  return val === "true";
}

export async function completeOnboarding(prefs: Pick<UserPreferences, "zones" | "filingTypes">): Promise<void> {
  await savePreferences({ ...prefs, onboardingDone: true });
}

export async function isNotificationsEnabled(): Promise<boolean> {
  const db = await getDb();
  const val = await getPreference(db, "notifications_enabled", "false");
  return val === "true";
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  const db = await getDb();
  await setPreference(db, "notifications_enabled", String(enabled));
}

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  const db = await getDb();
  if (prefs.zones !== undefined) {
    await setPreference(db, "zones", JSON.stringify(prefs.zones));
  }
  if (prefs.filingTypes !== undefined) {
    await setPreference(db, "filing_types", JSON.stringify(prefs.filingTypes));
  }
  if (prefs.tags !== undefined) {
    await setPreference(db, "tags", JSON.stringify(prefs.tags));
  }
  if (prefs.onboardingDone !== undefined) {
    await setPreference(db, "onboarding_done", String(prefs.onboardingDone));
  }
}
