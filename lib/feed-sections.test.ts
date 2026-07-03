import { describe, it, expect } from 'vitest';
import { groupPermitsBySection, NO_DATE_KEY } from './feed-sections';
import type { FeedCardDateInput } from './feed-card-date';

/** Minimal permit factory — only the three date fields the grouping reads. */
function permit(
  dates: Partial<FeedCardDateInput> & { id: number }
): FeedCardDateInput & { id: number } {
  return {
    source_updated_at: null,
    date_issued: null,
    first_seen_at: null,
    ...dates,
  };
}

describe('groupPermitsBySection', () => {
  it('groups adjacent permits of the same request month under one Italian header', () => {
    const permits = [
      permit({ id: 1, source_updated_at: '2024-11-18' }),
      permit({ id: 2, source_updated_at: '2024-11-05' }),
      permit({ id: 3, source_updated_at: '2024-10-30' }),
    ];
    const sections = groupPermitsBySection(permits, 'request_newest');
    expect(sections.map((s) => s.title)).toEqual(['Novembre 2024', 'Ottobre 2024']);
    expect(sections[0].data.map((p) => p.id)).toEqual([1, 2]);
    expect(sections[1].data.map((p) => p.id)).toEqual([3]);
    expect(sections[0].bucket).toBe('2024-11');
  });

  it('buckets on the closing month when sorting by closing date', () => {
    const permits = [
      permit({ id: 1, source_updated_at: '2024-11-18', date_issued: '2024-06-20' }),
      permit({ id: 2, source_updated_at: '2024-03-01', date_issued: '2024-06-01' }),
    ];
    const sections = groupPermitsBySection(permits, 'closing_newest');
    // Both close in June even though their request months differ.
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Giugno 2024');
    expect(sections[0].data.map((p) => p.id)).toEqual([1, 2]);
  });

  it('never reorders: two non-adjacent runs of the same month yield two sections', () => {
    const permits = [
      permit({ id: 1, source_updated_at: '2024-11-20' }),
      permit({ id: 2, source_updated_at: '2024-10-15' }),
      permit({ id: 3, source_updated_at: '2024-11-02' }),
    ];
    const sections = groupPermitsBySection(permits, 'request_newest');
    expect(sections.map((s) => s.title)).toEqual([
      'Novembre 2024',
      'Ottobre 2024',
      'Novembre 2024',
    ]);
    expect(sections.map((s) => s.data.map((p) => p.id))).toEqual([[1], [2], [3]]);
  });

  it('falls back through the sort preference so the header matches the shown date', () => {
    // Request sort, but no request date → the card shows (and sections by) the closing date.
    const sections = groupPermitsBySection(
      [permit({ id: 1, source_updated_at: null, date_issued: '2024-09-19' })],
      'request_newest'
    );
    expect(sections[0].title).toBe('Settembre 2024');
  });

  it('collects date-less permits into a "Senza data" bucket', () => {
    const sections = groupPermitsBySection(
      [
        permit({ id: 1, source_updated_at: '2024-11-18' }),
        permit({ id: 2, source_updated_at: null, date_issued: null, first_seen_at: null }),
      ],
      'request_newest'
    );
    expect(sections.map((s) => s.title)).toEqual(['Novembre 2024', 'Senza data']);
    expect(sections[1].bucket).toBe(NO_DATE_KEY);
  });

  it('handles an ISO datetime suffix on the sorted date', () => {
    const sections = groupPermitsBySection(
      [permit({ id: 1, first_seen_at: '2025-01-04T09:12:00.000Z' })],
      'newest'
    );
    expect(sections[0].title).toBe('Gennaio 2025');
  });

  it('returns no sections for an empty list', () => {
    expect(groupPermitsBySection([], 'request_newest')).toEqual([]);
  });
});
