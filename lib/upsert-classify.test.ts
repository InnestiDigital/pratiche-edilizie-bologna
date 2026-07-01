import { describe, it, expect } from 'vitest';
import { classifyUpsert } from './upsert-classify';

describe('classifyUpsert', () => {
  describe('no existing row (INSERT OR IGNORE branch)', () => {
    it('classifies as inserted when the insert actually happened', () => {
      expect(classifyUpsert(null, 'rilasciata', 1)).toBe('inserted');
    });

    it('classifies as unchanged when the insert was ignored (raced duplicate)', () => {
      // The bug this guards against: a concurrent sync inserted the same
      // source_id between our lookup and insert, so changes === 0 and the
      // permit is NOT new to us — counting it as "inserted" would inflate the
      // new-permit notification.
      expect(classifyUpsert(null, 'rilasciata', 0)).toBe('unchanged');
    });

    it('treats any positive change count as inserted', () => {
      expect(classifyUpsert(null, 'in_attesa', 2)).toBe('inserted');
    });

    it('treats a negative change count defensively as unchanged', () => {
      expect(classifyUpsert(null, 'in_attesa', -1)).toBe('unchanged');
    });

    it('ignores incoming status when deciding a fresh insert', () => {
      expect(classifyUpsert(null, '', 1)).toBe('inserted');
      expect(classifyUpsert(null, '', 0)).toBe('unchanged');
    });
  });

  describe('existing row present', () => {
    it('classifies as updated when the status changed', () => {
      expect(classifyUpsert({ status: 'in_attesa' }, 'rilasciata', 0)).toBe('updated');
    });

    it('classifies as unchanged when the status is identical', () => {
      expect(classifyUpsert({ status: 'rilasciata' }, 'rilasciata', 0)).toBe('unchanged');
    });

    it('ignores insertChanges entirely when a row already exists', () => {
      // insertChanges only pertains to the INSERT OR IGNORE path; an existing
      // row must never be re-classified based on it.
      expect(classifyUpsert({ status: 'in_attesa' }, 'rilasciata', 999)).toBe('updated');
      expect(classifyUpsert({ status: 'rilasciata' }, 'rilasciata', 999)).toBe('unchanged');
    });

    it('treats an empty-string status change as an update', () => {
      expect(classifyUpsert({ status: 'rilasciata' }, '', 0)).toBe('updated');
      expect(classifyUpsert({ status: '' }, '', 0)).toBe('unchanged');
    });

    it('is case-sensitive on status (raw enum values, never user text)', () => {
      expect(classifyUpsert({ status: 'rilasciata' }, 'Rilasciata', 0)).toBe('updated');
    });
  });
});
