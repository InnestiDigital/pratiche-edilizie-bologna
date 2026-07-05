import { describe, it, expect } from 'vitest';
import { buildNotificationData, notificationRoute } from './notification-link';

describe('buildNotificationData', () => {
  it('flags new when the sync brought genuinely-new permits', () => {
    expect(buildNotificationData(1)).toEqual({ screen: '/(tabs)', new: '1' });
    expect(buildNotificationData(7)).toEqual({ screen: '/(tabs)', new: '1' });
  });

  it('omits the new flag when nothing is new (update-only notification)', () => {
    expect(buildNotificationData(0)).toEqual({ screen: '/(tabs)' });
  });

  it('treats non-positive / non-finite / fractional counts as nothing new', () => {
    expect(buildNotificationData(-3)).toEqual({ screen: '/(tabs)' });
    expect(buildNotificationData(NaN)).toEqual({ screen: '/(tabs)' });
    expect(buildNotificationData(Infinity)).toEqual({ screen: '/(tabs)' });
    // fractional below 1 is not a whole new permit → no flag
    expect(buildNotificationData(0.5)).toEqual({ screen: '/(tabs)' });
  });
});

describe('notificationRoute', () => {
  it('opens the Solo nuovi feed for a new-permits payload', () => {
    expect(notificationRoute({ screen: '/(tabs)', new: '1' })).toEqual({
      pathname: '/(tabs)',
      params: { new: '1' },
    });
  });

  it('opens the plain feed for an update-only (legacy screen-only) payload', () => {
    expect(notificationRoute({ screen: '/(tabs)' })).toEqual({
      pathname: '/(tabs)',
      params: {},
    });
  });

  it('round-trips its own builder output', () => {
    expect(notificationRoute(buildNotificationData(2))).toEqual({
      pathname: '/(tabs)',
      params: { new: '1' },
    });
    expect(notificationRoute(buildNotificationData(0))).toEqual({
      pathname: '/(tabs)',
      params: {},
    });
  });

  it('falls back to the plain feed for malformed / absent / junk payloads', () => {
    expect(notificationRoute(undefined)).toEqual({ pathname: '/(tabs)', params: {} });
    expect(notificationRoute(null)).toEqual({ pathname: '/(tabs)', params: {} });
    expect(notificationRoute('new')).toEqual({ pathname: '/(tabs)', params: {} });
    expect(notificationRoute(42)).toEqual({ pathname: '/(tabs)', params: {} });
    expect(notificationRoute({})).toEqual({ pathname: '/(tabs)', params: {} });
    // wrong token (number 1, boolean true, '0') must not open Solo nuovi
    expect(notificationRoute({ new: 1 })).toEqual({ pathname: '/(tabs)', params: {} });
    expect(notificationRoute({ new: true })).toEqual({ pathname: '/(tabs)', params: {} });
    expect(notificationRoute({ new: '0' })).toEqual({ pathname: '/(tabs)', params: {} });
  });
});
