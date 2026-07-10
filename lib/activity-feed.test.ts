import { describe, it, expect } from 'vitest';
import { buildActivityFeed, activityCount, type ActivityInput } from './activity-feed';

/** Minimal row builder — only the fields the activity feed reads. */
function row(over: Partial<ActivityInput> & { id: number }): ActivityInput {
  return {
    status: 'concluso',
    previous_status: null,
    status_changed_at: null,
    is_new: 0,
    first_seen_at: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildActivityFeed', () => {
  it('classifies a persisted status flip as a transition, ordered by its flip time', () => {
    const feed = buildActivityFeed([
      row({
        id: 1,
        status: 'concluso',
        previous_status: 'in_corso',
        status_changed_at: '2026-07-05T09:00:00.000Z',
      }),
    ]);
    expect(feed).toEqual([
      {
        permit: expect.objectContaining({ id: 1 }),
        kind: 'transition',
        at: '2026-07-05T09:00:00.000Z',
      },
    ]);
  });

  it('classifies a fresh arrival as new, ordered by first-seen', () => {
    const feed = buildActivityFeed([
      row({ id: 2, is_new: 1, first_seen_at: '2026-07-06T00:00:00.000Z' }),
    ]);
    expect(feed).toEqual([
      { permit: expect.objectContaining({ id: 2 }), kind: 'new', at: '2026-07-06T00:00:00.000Z' },
    ]);
  });

  it('omits rows that are neither new nor transitioned', () => {
    expect(buildActivityFeed([row({ id: 3 })])).toEqual([]);
  });

  it('prefers the transition classification when a row is both new and moved', () => {
    const feed = buildActivityFeed([
      row({
        id: 4,
        is_new: 1,
        status: 'concluso',
        previous_status: 'in_attesa',
        status_changed_at: '2026-07-04T00:00:00.000Z',
      }),
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('transition');
    expect(feed[0].at).toBe('2026-07-04T00:00:00.000Z');
  });

  it('falls back to first-seen when a transition has no stamped time', () => {
    const feed = buildActivityFeed([
      row({
        id: 5,
        status: 'concluso',
        previous_status: 'in_corso',
        status_changed_at: null,
        first_seen_at: '2026-06-01T00:00:00.000Z',
      }),
    ]);
    expect(feed[0]).toMatchObject({ kind: 'transition', at: '2026-06-01T00:00:00.000Z' });
  });

  it('does NOT treat a no-op previous === current as a transition', () => {
    // A defensively mis-written row: prior status equals the current one.
    expect(
      buildActivityFeed([
        row({ id: 6, status: 'concluso', previous_status: 'concluso', status_changed_at: 'x' }),
      ])
    ).toEqual([]);
  });

  it('ignores an empty-string previous_status (legacy/undecoded)', () => {
    expect(buildActivityFeed([row({ id: 7, previous_status: '' })])).toEqual([]);
  });

  it('orders newest change first across mixed kinds', () => {
    const feed = buildActivityFeed([
      row({ id: 10, is_new: 1, first_seen_at: '2026-07-02T00:00:00.000Z' }),
      row({
        id: 11,
        status: 'concluso',
        previous_status: 'in_corso',
        status_changed_at: '2026-07-08T00:00:00.000Z',
      }),
      row({ id: 12, is_new: 1, first_seen_at: '2026-07-05T00:00:00.000Z' }),
    ]);
    expect(feed.map((e) => e.permit.id)).toEqual([11, 12, 10]);
  });

  it('breaks a timestamp tie by id descending (deterministic)', () => {
    const feed = buildActivityFeed([
      row({ id: 20, is_new: 1, first_seen_at: '2026-07-05T00:00:00.000Z' }),
      row({ id: 22, is_new: 1, first_seen_at: '2026-07-05T00:00:00.000Z' }),
      row({ id: 21, is_new: 1, first_seen_at: '2026-07-05T00:00:00.000Z' }),
    ]);
    expect(feed.map((e) => e.permit.id)).toEqual([22, 21, 20]);
  });
});

describe('activityCount', () => {
  it('counts new and transitioned rows, skipping quiet ones', () => {
    expect(
      activityCount([
        row({ id: 1, is_new: 1 }),
        row({ id: 2, status: 'concluso', previous_status: 'in_corso' }),
        row({ id: 3 }),
        row({ id: 4, previous_status: '' }),
        row({ id: 5, status: 'x', previous_status: 'x' }),
      ])
    ).toBe(2);
  });

  it('agrees with buildActivityFeed length', () => {
    const rows = [
      row({ id: 1, is_new: 1 }),
      row({ id: 2, status: 'concluso', previous_status: 'in_corso' }),
      row({ id: 3, is_new: 1, status: 'concluso', previous_status: 'in_attesa' }),
      row({ id: 4 }),
    ];
    expect(activityCount(rows)).toBe(buildActivityFeed(rows).length);
  });

  it('is 0 for an empty input', () => {
    expect(activityCount([])).toBe(0);
  });
});
