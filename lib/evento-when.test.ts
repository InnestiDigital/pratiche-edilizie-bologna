import { describe, expect, it } from 'vitest';

import { formatEventoWhen } from './evento-when';

describe('formatEventoWhen', () => {
  it('renders a multi-day run as "Dal <start> al <end>" when end differs from start', () => {
    expect(formatEventoWhen('2025-03-15', '2025-03-22')).toBe('Dal 15/03/2025 al 22/03/2025');
  });

  it('collapses a same-day span (end == start) to a single "Il <start>"', () => {
    expect(formatEventoWhen('2025-03-15', '2025-03-15')).toBe('Il 15/03/2025');
  });

  it('renders "Il <start>" when only a start date is present', () => {
    expect(formatEventoWhen('2025-03-15', null)).toBe('Il 15/03/2025');
  });

  it('falls back to "Il <end>" when only an end date is present', () => {
    expect(formatEventoWhen(null, '2025-03-22')).toBe('Il 22/03/2025');
  });

  it('returns null when neither date is present', () => {
    expect(formatEventoWhen(null, null)).toBeNull();
  });

  it('treats blank / whitespace-only strings as absent (never throws)', () => {
    expect(formatEventoWhen('', '')).toBeNull();
    expect(formatEventoWhen('   ', '2025-03-22')).toBe('Il 22/03/2025');
  });

  it('accepts undefined as absent (the extra decoder returns undefined for missing keys)', () => {
    expect(formatEventoWhen(undefined, undefined)).toBeNull();
    expect(formatEventoWhen('2025-03-15', undefined)).toBe('Il 15/03/2025');
  });

  it('formats off the YYYY-MM-DD prefix of a full ISO timestamp', () => {
    expect(formatEventoWhen('2025-03-15T00:00:00.000Z', '2025-03-22T00:00:00.000Z')).toBe(
      'Dal 15/03/2025 al 22/03/2025'
    );
  });
});
