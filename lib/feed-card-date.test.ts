import { describe, it, expect } from 'vitest';
import { feedCardDate } from './feed-card-date';

const FULL = {
  source_updated_at: '2024-03-15', // richiesta
  date_issued: '2024-06-20', // chiusura
  first_seen_at: '2025-01-04T10:12:00Z', // rilevata
};

describe('feedCardDate', () => {
  it('shows the request date (labelled) when sorting by request date', () => {
    for (const sort of ['request_newest', 'request_oldest'] as const) {
      expect(feedCardDate(FULL, sort)).toEqual({
        kind: 'richiesta',
        label: 'Richiesta',
        icon: 'document-text-outline',
        date: '15/03/2024',
      });
    }
  });

  it('shows the closing date (labelled) when sorting by closing date', () => {
    expect(feedCardDate(FULL, 'closing_newest')).toEqual({
      kind: 'chiusura',
      label: 'Conclusa',
      icon: 'checkmark-circle-outline',
      date: '20/06/2024',
    });
  });

  it('shows the detected date when sorting by detection (newest/oldest)', () => {
    for (const sort of ['newest', 'oldest'] as const) {
      expect(feedCardDate(FULL, sort)).toEqual({
        kind: 'rilevata',
        label: 'Rilevata',
        icon: 'eye-outline',
        date: '04/01/2025',
      });
    }
  });

  it('defaults to the detection date when sort is undefined (matches default SORT_SQL)', () => {
    expect(feedCardDate(FULL, undefined)?.kind).toBe('rilevata');
  });

  it('falls back through the preference order when the preferred field is null', () => {
    // Request sort, but no request date → next preference is the closing date.
    expect(
      feedCardDate(
        { source_updated_at: null, date_issued: '2024-06-20', first_seen_at: '2025-01-04' },
        'request_newest'
      )
    ).toMatchObject({ kind: 'chiusura', date: '20/06/2024' });

    // Closing sort, but no closing date → falls back to the request date.
    expect(
      feedCardDate(
        { source_updated_at: '2024-03-15', date_issued: null, first_seen_at: '2025-01-04' },
        'closing_newest'
      )
    ).toMatchObject({ kind: 'richiesta', date: '15/03/2024' });
  });

  it('falls back to the always-present detected date when both domain dates are null', () => {
    expect(
      feedCardDate(
        { source_updated_at: null, date_issued: null, first_seen_at: '2025-01-04' },
        'request_newest'
      )
    ).toMatchObject({ kind: 'rilevata', date: '04/01/2025' });
  });

  it('treats blank / whitespace-only dates as absent and keeps falling back', () => {
    expect(
      feedCardDate(
        { source_updated_at: '   ', date_issued: '2024-06-20', first_seen_at: '2025-01-04' },
        'request_newest'
      )
    ).toMatchObject({ kind: 'chiusura' });
  });

  it('returns null only when the permit has no parseable date at all', () => {
    expect(
      feedCardDate(
        { source_updated_at: null, date_issued: null, first_seen_at: null },
        'request_newest'
      )
    ).toBeNull();
    expect(
      feedCardDate({ source_updated_at: '', date_issued: '  ', first_seen_at: '' }, 'newest')
    ).toBeNull();
  });
});
