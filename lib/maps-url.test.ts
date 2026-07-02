import { describe, it, expect } from 'vitest';
import { buildMapsQuery, buildMapsUrl } from './maps-url';

describe('buildMapsQuery', () => {
  it('anchors the address to Bologna, Italia', () => {
    expect(buildMapsQuery('Via Marconi 24')).toBe('Via Marconi 24, Bologna, Italia');
  });

  it('trims surrounding whitespace before anchoring', () => {
    expect(buildMapsQuery('  Via Zamboni 33  ')).toBe('Via Zamboni 33, Bologna, Italia');
  });

  it('returns null when there is no address to search', () => {
    expect(buildMapsQuery(null)).toBeNull();
    expect(buildMapsQuery(undefined)).toBeNull();
    expect(buildMapsQuery('')).toBeNull();
    expect(buildMapsQuery('   ')).toBeNull();
  });
});

describe('buildMapsUrl', () => {
  it('builds an Apple Maps URL on iOS', () => {
    expect(buildMapsUrl('Via Marconi 24', 'ios')).toBe(
      'http://maps.apple.com/?q=Via%20Marconi%2024%2C%20Bologna%2C%20Italia'
    );
  });

  it('builds a Google Maps universal search URL on Android', () => {
    expect(buildMapsUrl('Via Marconi 24', 'android')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Via%20Marconi%2024%2C%20Bologna%2C%20Italia'
    );
  });

  it('falls back to Google Maps for any non-iOS platform (web/unknown)', () => {
    const encoded = 'Via%20Marconi%2024%2C%20Bologna%2C%20Italia';
    expect(buildMapsUrl('Via Marconi 24', 'web')).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encoded}`
    );
    expect(buildMapsUrl('Via Marconi 24', 'macos')).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encoded}`
    );
  });

  it('percent-encodes characters that would break the URL (commas, spaces, accents, &)', () => {
    // Piazza dell'Unità with an ampersand-ish edge — ensure encodeURIComponent handles it.
    const url = buildMapsUrl("Piazza dell'Unità & Co", 'ios');
    expect(url).toBe(
      "http://maps.apple.com/?q=Piazza%20dell'Unit%C3%A0%20%26%20Co%2C%20Bologna%2C%20Italia"
    );
    // The raw query string must never leak an unencoded ampersand into the URL params.
    expect(url).not.toContain(' & ');
  });

  it('returns null when there is no address (caller hides the action)', () => {
    expect(buildMapsUrl(null, 'ios')).toBeNull();
    expect(buildMapsUrl('', 'android')).toBeNull();
    expect(buildMapsUrl('   ', 'web')).toBeNull();
  });
});
