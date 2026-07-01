import { describe, it, expect } from 'vitest';
import { tallyOutcomes } from './sync-tally';
import type { UpsertOutcome } from './upsert-classify';

describe('tallyOutcomes', () => {
  it('returns zero counts for an empty list', () => {
    expect(tallyOutcomes([])).toEqual({ inserted: 0, updated: 0 });
  });

  it('counts inserts', () => {
    expect(tallyOutcomes(['inserted', 'inserted', 'inserted'])).toEqual({
      inserted: 3,
      updated: 0,
    });
  });

  it('counts updates', () => {
    expect(tallyOutcomes(['updated', 'updated'])).toEqual({ inserted: 0, updated: 2 });
  });

  it('does not count unchanged outcomes (would inflate the notification)', () => {
    expect(tallyOutcomes(['unchanged', 'unchanged'])).toEqual({ inserted: 0, updated: 0 });
  });

  it('tallies a mixed list, ignoring unchanged', () => {
    const outcomes: UpsertOutcome[] = [
      'inserted',
      'unchanged',
      'updated',
      'inserted',
      'unchanged',
      'updated',
      'updated',
    ];
    expect(tallyOutcomes(outcomes)).toEqual({ inserted: 2, updated: 3 });
  });

  it('does not mutate or alias the input', () => {
    const outcomes: UpsertOutcome[] = ['inserted', 'updated'];
    const snapshot = [...outcomes];
    tallyOutcomes(outcomes);
    expect(outcomes).toEqual(snapshot);
  });

  it('returns a fresh object each call', () => {
    const a = tallyOutcomes(['inserted']);
    const b = tallyOutcomes(['updated']);
    expect(a).not.toBe(b);
    expect(a).toEqual({ inserted: 1, updated: 0 });
    expect(b).toEqual({ inserted: 0, updated: 1 });
  });
});
