import { describe, it, expect } from 'vitest';
import { classifyUpsert, PERMIT_CONTENT_FIELDS, type PermitContent } from './upsert-classify';

/** A representative stored/incoming content row; overrides tweak one field. */
function content(overrides: Partial<PermitContent> = {}): PermitContent {
  return {
    source_updated_at: '2025-03-01',
    address: 'Via Indipendenza 10',
    zone: 'Navile',
    codvia: 350,
    procedimento: 'PDC ORDINARIO',
    date_issued: '2025-06-01',
    status: 'rilasciata',
    status_raw: 'Rilasciata',
    tags: '["ristrutturazione"]',
    source_link: 'https://portal/pdc/2025/1',
    title: null,
    extra: '{}',
    ...overrides,
  };
}

describe('classifyUpsert', () => {
  describe('no existing row (INSERT OR IGNORE branch)', () => {
    it('classifies as inserted when the insert actually happened', () => {
      expect(classifyUpsert(null, content(), 1)).toBe('inserted');
    });

    it('classifies as unchanged when the insert was ignored (raced duplicate)', () => {
      // The bug this guards against: a concurrent sync inserted the same
      // source_id between our lookup and insert, so changes === 0 and the
      // permit is NOT new to us — counting it as "inserted" would inflate the
      // new-permit notification.
      expect(classifyUpsert(null, content(), 0)).toBe('unchanged');
    });

    it('treats any positive change count as inserted', () => {
      expect(classifyUpsert(null, content(), 2)).toBe('inserted');
    });

    it('treats a negative change count defensively as unchanged', () => {
      expect(classifyUpsert(null, content(), -1)).toBe('unchanged');
    });

    it('ignores incoming content when deciding a fresh insert', () => {
      expect(classifyUpsert(null, content({ status: '' }), 1)).toBe('inserted');
      expect(classifyUpsert(null, content({ status: '' }), 0)).toBe('unchanged');
    });
  });

  describe('existing row present', () => {
    it('classifies as unchanged only when every content field is identical', () => {
      expect(classifyUpsert(content(), content(), 0)).toBe('unchanged');
    });

    it('ignores insertChanges entirely when a row already exists', () => {
      // insertChanges only pertains to the INSERT OR IGNORE path; an existing
      // row must never be re-classified based on it.
      expect(classifyUpsert(content({ status: 'in_attesa' }), content(), 999)).toBe('updated');
      expect(classifyUpsert(content(), content(), 999)).toBe('unchanged');
    });

    it('classifies as updated when any single content field changed', () => {
      // One representative case per PERMIT_CONTENT_FIELD: a change to ANY of them
      // now heals (the old status-only comparison left every non-status
      // correction — and every eventi/segnalazioni row, whose status is a
      // constant — permanently stale).
      const changed: Partial<PermitContent>[] = [
        { source_updated_at: '2025-04-01' },
        { address: 'Via Rizzoli 1' },
        { zone: 'Savena' },
        { codvia: 999 },
        { procedimento: 'PDC IN SANATORIA' },
        { date_issued: '2025-07-01' },
        { status: 'in_attesa' },
        { status_raw: 'In attesa' },
        { tags: '["urbanistica"]' },
        { source_link: 'https://portal/pdc/2025/2' },
        { title: 'Un titolo' },
        { extra: '{"start":"2025-01-01"}' },
      ];
      for (const override of changed) {
        expect(classifyUpsert(content(), content(override), 0)).toBe('updated');
      }
    });

    it('treats an empty-string status change as an update', () => {
      expect(classifyUpsert(content({ status: 'rilasciata' }), content({ status: '' }), 0)).toBe(
        'updated'
      );
      expect(classifyUpsert(content({ status: '' }), content({ status: '' }), 0)).toBe('unchanged');
    });

    it('is case-sensitive on status (raw enum values, never user text)', () => {
      expect(
        classifyUpsert(content({ status: 'rilasciata' }), content({ status: 'Rilasciata' }), 0)
      ).toBe('updated');
    });

    it('detects a null → value transition on a nullable field', () => {
      expect(
        classifyUpsert(content({ date_issued: null }), content({ date_issued: '2025-06-01' }), 0)
      ).toBe('updated');
      expect(
        classifyUpsert(content({ date_issued: null }), content({ date_issued: null }), 0)
      ).toBe('unchanged');
    });
  });

  describe('PERMIT_CONTENT_FIELDS (the comparison field set)', () => {
    it('excludes identity and app-side columns so they never count as a change', () => {
      const fields = new Set<string>(PERMIT_CONTENT_FIELDS);
      for (const identity of ['dataset', 'source_id', 'filing_type', 'category']) {
        expect(fields.has(identity)).toBe(false);
      }
      for (const appSide of ['id', 'first_seen_at', 'is_new']) {
        expect(fields.has(appSide)).toBe(false);
      }
    });

    it('has no duplicate entries', () => {
      expect(new Set(PERMIT_CONTENT_FIELDS).size).toBe(PERMIT_CONTENT_FIELDS.length);
    });
  });
});
