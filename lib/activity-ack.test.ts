import { describe, it, expect } from 'vitest';
import { activityInstant, isUnacknowledgedActivity } from './activity-ack';

describe('activityInstant', () => {
  it('picks status_changed_at when present', () => {
    expect(
      activityInstant({
        status_changed_at: '2026-07-10T10:00:00.000Z',
        first_seen_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe('2026-07-10T10:00:00.000Z');
  });

  it('falls back to first_seen_at when status_changed_at is null', () => {
    expect(
      activityInstant({ status_changed_at: null, first_seen_at: '2026-01-01T00:00:00.000Z' })
    ).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('isUnacknowledgedActivity', () => {
  it('null watermark -> true (never acknowledged)', () => {
    expect(isUnacknowledgedActivity('2026-07-10T10:00:00.000Z', null)).toBe(true);
  });

  it('empty watermark -> true', () => {
    expect(isUnacknowledgedActivity('2026-07-10T10:00:00.000Z', '')).toBe(true);
  });

  it('older instant -> false (already acknowledged)', () => {
    expect(isUnacknowledgedActivity('2026-07-01T00:00:00.000Z', '2026-07-10T00:00:00.000Z')).toBe(
      false
    );
  });

  it('equal instant -> false (acknowledged, not strictly newer)', () => {
    expect(isUnacknowledgedActivity('2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z')).toBe(
      false
    );
  });

  it('newer instant -> true', () => {
    expect(isUnacknowledgedActivity('2026-07-11T00:00:00.000Z', '2026-07-10T00:00:00.000Z')).toBe(
      true
    );
  });

  it('null/undefined/empty instant -> true (fail-open on malformed data)', () => {
    expect(isUnacknowledgedActivity(null, '2026-07-10T00:00:00.000Z')).toBe(true);
    expect(isUnacknowledgedActivity(undefined, '2026-07-10T00:00:00.000Z')).toBe(true);
    expect(isUnacknowledgedActivity('', '2026-07-10T00:00:00.000Z')).toBe(true);
  });
});
