import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, STATUS_DESCRIPTIONS } from './constants';

// The detail screen shows a plain-Italian caption under the status pill by looking
// up STATUS_DESCRIPTIONS[permit.status]. These checks guard the *copy* and the
// intended coverage: every meaningful status has a distinct, non-empty caption,
// the 'altro' catch-all deliberately has none, and an unknown status yields
// `undefined` (so the UI renders no caption rather than placeholder text).
describe('status-description copy', () => {
  // Every normalized status except the 'altro' catch-all.
  const meaningfulStatuses = Object.keys(STATUS_LABELS).filter((s) => s !== 'altro');

  it('has a non-empty description for every meaningful status', () => {
    for (const status of meaningfulStatuses) {
      const desc = STATUS_DESCRIPTIONS[status];
      expect(desc, `missing description for status "${status}"`).toBeDefined();
      expect(desc.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives no caption to the catch-all "altro" status', () => {
    expect(STATUS_DESCRIPTIONS.altro).toBeUndefined();
  });

  it('yields undefined for an unknown status (no placeholder rendered)', () => {
    expect(STATUS_DESCRIPTIONS['not_a_real_status']).toBeUndefined();
  });

  it('gives each status a distinct description', () => {
    const descriptions = meaningfulStatuses.map((s) => STATUS_DESCRIPTIONS[s]);
    expect(new Set(descriptions).size).toBe(meaningfulStatuses.length);
  });

  it('does not describe a status it does not also label', () => {
    // Guard against a description key that has no matching STATUS_LABELS entry —
    // it would never be reachable from the UI and signals a typo.
    for (const key of Object.keys(STATUS_DESCRIPTIONS)) {
      expect(STATUS_LABELS[key], `description "${key}" has no matching label`).toBeDefined();
    }
  });
});
