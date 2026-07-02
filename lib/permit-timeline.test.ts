import { describe, it, expect } from 'vitest';
import { buildPermitTimeline } from './permit-timeline';

describe('buildPermitTimeline', () => {
  it('orders events chronologically by date, oldest first', () => {
    const events = buildPermitTimeline({
      source_updated_at: '2024-11-18',
      date_issued: '2024-11-15',
      first_seen_at: '2025-01-04T10:12:00Z',
    });
    expect(events.map((e) => e.key)).toEqual(['chiusura', 'richiesta', 'rilevata']);
    expect(events.map((e) => e.date)).toEqual(['15/11/2024', '18/11/2024', '04/01/2025']);
  });

  it('reads request → closing when the request precedes the closing', () => {
    const events = buildPermitTimeline({
      source_updated_at: '2024-01-10',
      date_issued: '2024-06-20',
      first_seen_at: '2024-07-01',
    });
    expect(events.map((e) => e.key)).toEqual(['richiesta', 'chiusura', 'rilevata']);
  });

  it('omits events with no date (open, not-yet-closed permit)', () => {
    const events = buildPermitTimeline({
      source_updated_at: '2024-03-01',
      date_issued: null,
      first_seen_at: '2024-03-05',
    });
    expect(events.map((e) => e.key)).toEqual(['richiesta', 'rilevata']);
  });

  it('omits events whose date has no parseable YYYY-MM-DD prefix', () => {
    const events = buildPermitTimeline({
      source_updated_at: 'n.d.',
      date_issued: '2024-05-05',
      first_seen_at: '2024-05-10',
    });
    expect(events.map((e) => e.key)).toEqual(['chiusura', 'rilevata']);
  });

  it('breaks a same-day tie in request → closing → detected order', () => {
    const events = buildPermitTimeline({
      source_updated_at: '2024-04-04',
      date_issued: '2024-04-04',
      first_seen_at: '2024-04-04T09:00:00Z',
    });
    expect(events.map((e) => e.key)).toEqual(['richiesta', 'chiusura', 'rilevata']);
  });

  it('returns an empty list when nothing is dated', () => {
    expect(
      buildPermitTimeline({ source_updated_at: null, date_issued: null, first_seen_at: null })
    ).toEqual([]);
  });

  it('formats every date as Italian dd/mm/yyyy (TZ-safe, from the string prefix)', () => {
    const events = buildPermitTimeline({
      source_updated_at: '2024-01-01',
      date_issued: null,
      first_seen_at: '2024-12-31T23:59:59Z',
    });
    expect(events.map((e) => e.date)).toEqual(['01/01/2024', '31/12/2024']);
  });

  it('carries a label, icon and color for each event', () => {
    const [first] = buildPermitTimeline({
      source_updated_at: '2024-02-02',
      date_issued: null,
      first_seen_at: null,
    });
    expect(first.label).toBe('Richiesta presentata');
    expect(first.icon).toBe('document-text-outline');
    expect(first.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('never throws on whitespace / odd date strings', () => {
    expect(() =>
      buildPermitTimeline({ source_updated_at: '   ', date_issued: '\t', first_seen_at: '2024' })
    ).not.toThrow();
    expect(
      buildPermitTimeline({ source_updated_at: '   ', date_issued: '\t', first_seen_at: '2024' })
    ).toEqual([]);
  });
});
