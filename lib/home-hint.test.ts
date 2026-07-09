import { describe, it, expect } from 'vitest';
import { shouldShowHomeHint } from './home-hint';
import type { HomeLocation } from './home-location';

const HOME: HomeLocation = { coords: { lat: 44.4949, lon: 11.3426 }, label: 'Casa' };

describe('shouldShowHomeHint', () => {
  it('shows when there is data, no home, and not dismissed', () => {
    expect(shouldShowHomeHint({ home: null, dismissed: false, hasData: true })).toBe(true);
  });

  it('hides once a home is set (the filter surfaces on its own)', () => {
    expect(shouldShowHomeHint({ home: HOME, dismissed: false, hasData: true })).toBe(false);
  });

  it('hides after an explicit dismiss', () => {
    expect(shouldShowHomeHint({ home: null, dismissed: true, hasData: true })).toBe(false);
  });

  it('hides when the feed has no data to anchor', () => {
    expect(shouldShowHomeHint({ home: null, dismissed: false, hasData: false })).toBe(false);
  });

  it('stays hidden when a home is set even if dismissed is false and data exists', () => {
    // A set home dominates: the hint is moot, never shown regardless of dismiss.
    expect(shouldShowHomeHint({ home: HOME, dismissed: false, hasData: true })).toBe(false);
  });

  it('stays hidden when every suppressor is active', () => {
    expect(shouldShowHomeHint({ home: HOME, dismissed: true, hasData: false })).toBe(false);
  });
});
