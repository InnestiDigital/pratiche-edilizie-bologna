import { describe, it, expect } from 'vitest';
import { feedCardDate } from './feed-card-date';

const FULL = {
  category: 'edilizia' as const,
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
        {
          category: 'edilizia',
          source_updated_at: null,
          date_issued: '2024-06-20',
          first_seen_at: '2025-01-04',
        },
        'request_newest'
      )
    ).toMatchObject({ kind: 'chiusura', date: '20/06/2024' });

    // Closing sort, but no closing date → falls back to the request date.
    expect(
      feedCardDate(
        {
          category: 'edilizia',
          source_updated_at: '2024-03-15',
          date_issued: null,
          first_seen_at: '2025-01-04',
        },
        'closing_newest'
      )
    ).toMatchObject({ kind: 'richiesta', date: '15/03/2024' });
  });

  it('labels the closing date by category: completion → "Conclusa" + check, scheduled → date name + calendar', () => {
    // Scheduled categories: date_issued is a FUTURE date, not a conclusion — the
    // card must not claim "Conclusa" with a done-check (would contradict the
    // In corso / In programma status badge). Mirrors buildPermitTimeline.
    expect(
      feedCardDate(
        {
          category: 'cantieri',
          source_updated_at: null,
          date_issued: '2026-09-15',
          first_seen_at: '2025-01-04',
        },
        'closing_newest'
      )
    ).toEqual({
      kind: 'chiusura',
      label: 'Fine lavori',
      icon: 'calendar-outline',
      date: '15/09/2026',
    });

    expect(
      feedCardDate(
        {
          category: 'eventi',
          source_updated_at: null,
          date_issued: '2026-09-15',
          first_seen_at: '2025-01-04',
        },
        'closing_newest'
      )
    ).toEqual({
      kind: 'chiusura',
      label: "Data dell'evento",
      icon: 'calendar-outline',
      date: '15/09/2026',
    });

    // Completion categories keep the compact "Conclusa" + done-check.
    for (const category of ['edilizia', 'commercio', 'segnalazioni'] as const) {
      expect(feedCardDate({ ...FULL, category }, 'closing_newest')).toMatchObject({
        kind: 'chiusura',
        label: 'Conclusa',
        icon: 'checkmark-circle-outline',
      });
    }
  });

  it("shows an event's detection date (not its future end date) under a request sort", () => {
    // The request_* sorts order eventi by first_seen_at (REQUEST_DATE_SQL), since an
    // event has no request date. The default richiesta→chiusura order would fall
    // through the NULL richiesta to date_issued (the FUTURE end date), desyncing the
    // card + section header from the list order. Mirror the SQL: lead with rilevata.
    const event = {
      category: 'eventi' as const,
      source_updated_at: null,
      date_issued: '2026-11-20', // future event date — must NOT be shown under a request sort
      first_seen_at: '2026-07-04T10:00:00Z', // the column the feed is ordered by
    };
    for (const sort of ['request_newest', 'request_oldest'] as const) {
      expect(feedCardDate(event, sort)).toEqual({
        kind: 'rilevata',
        label: 'Rilevata',
        icon: 'eye-outline',
        date: '04/07/2026',
      });
    }
    // The other sorts are unaffected: closing sort still shows the event date.
    expect(feedCardDate(event, 'closing_newest')).toMatchObject({
      kind: 'chiusura',
      date: '20/11/2026',
    });
  });

  it('falls back to the always-present detected date when both domain dates are null', () => {
    expect(
      feedCardDate(
        {
          category: 'edilizia',
          source_updated_at: null,
          date_issued: null,
          first_seen_at: '2025-01-04',
        },
        'request_newest'
      )
    ).toMatchObject({ kind: 'rilevata', date: '04/01/2025' });
  });

  it('treats blank / whitespace-only dates as absent and keeps falling back', () => {
    expect(
      feedCardDate(
        {
          category: 'edilizia',
          source_updated_at: '   ',
          date_issued: '2024-06-20',
          first_seen_at: '2025-01-04',
        },
        'request_newest'
      )
    ).toMatchObject({ kind: 'chiusura' });
  });

  it('returns null only when the permit has no parseable date at all', () => {
    expect(
      feedCardDate(
        { category: 'edilizia', source_updated_at: null, date_issued: null, first_seen_at: null },
        'request_newest'
      )
    ).toBeNull();
    expect(
      feedCardDate(
        { category: 'edilizia', source_updated_at: '', date_issued: '  ', first_seen_at: '' },
        'newest'
      )
    ).toBeNull();
  });
});
