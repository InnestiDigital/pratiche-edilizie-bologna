import { describe, it, expect } from 'vitest';
import { buildNotificationMessage, type NotificationSummary } from './notification-message';

/** Build a summary with sensible zero defaults. */
function sum(partial: Partial<NotificationSummary>): NotificationSummary {
  return { totalNew: 0, totalUpdated: 0, newByCategory: {}, ...partial };
}

describe('buildNotificationMessage', () => {
  it('returns null when nothing is new or updated', () => {
    expect(buildNotificationMessage(sum({}))).toBeNull();
  });

  describe('single category, new only', () => {
    it('edilizia singular / plural', () => {
      expect(buildNotificationMessage(sum({ totalNew: 1, newByCategory: { edilizia: 1 } }))).toBe(
        '1 nuova pratica'
      );
      expect(buildNotificationMessage(sum({ totalNew: 3, newByCategory: { edilizia: 3 } }))).toBe(
        '3 nuove pratiche'
      );
    });

    it('cantieri singular / plural', () => {
      expect(buildNotificationMessage(sum({ totalNew: 1, newByCategory: { cantieri: 1 } }))).toBe(
        '1 nuovo cantiere'
      );
      expect(buildNotificationMessage(sum({ totalNew: 3, newByCategory: { cantieri: 3 } }))).toBe(
        '3 nuovi cantieri'
      );
    });

    it('commercio singular / plural', () => {
      expect(buildNotificationMessage(sum({ totalNew: 1, newByCategory: { commercio: 1 } }))).toBe(
        '1 nuova attività'
      );
      expect(buildNotificationMessage(sum({ totalNew: 2, newByCategory: { commercio: 2 } }))).toBe(
        '2 nuove attività'
      );
    });

    it('eventi singular / plural', () => {
      expect(buildNotificationMessage(sum({ totalNew: 1, newByCategory: { eventi: 1 } }))).toBe(
        '1 nuovo evento'
      );
      expect(buildNotificationMessage(sum({ totalNew: 5, newByCategory: { eventi: 5 } }))).toBe(
        '5 nuovi eventi'
      );
    });

    it('segnalazioni singular / plural', () => {
      expect(
        buildNotificationMessage(sum({ totalNew: 1, newByCategory: { segnalazioni: 1 } }))
      ).toBe('1 nuova segnalazione');
      expect(
        buildNotificationMessage(sum({ totalNew: 2, newByCategory: { segnalazioni: 2 } }))
      ).toBe('2 nuove segnalazioni');
    });
  });

  describe('multiple categories', () => {
    it('joins two categories with " e "', () => {
      expect(
        buildNotificationMessage(sum({ totalNew: 8, newByCategory: { cantieri: 3, eventi: 5 } }))
      ).toBe('3 nuovi cantieri e 5 nuovi eventi');
    });

    it('joins three categories with commas and a final " e "', () => {
      expect(
        buildNotificationMessage(
          sum({ totalNew: 6, newByCategory: { edilizia: 2, cantieri: 3, eventi: 1 } })
        )
      ).toBe('2 nuove pratiche, 3 nuovi cantieri e 1 nuovo evento');
    });

    it('emits parts in CATEGORIES order regardless of key insertion order', () => {
      expect(
        buildNotificationMessage(
          sum({ totalNew: 3, newByCategory: { segnalazioni: 1, edilizia: 2 } })
        )
      ).toBe('2 nuove pratiche e 1 nuova segnalazione');
    });
  });

  describe('updates', () => {
    it('updated only, singular / plural', () => {
      expect(buildNotificationMessage(sum({ totalUpdated: 1 }))).toBe('1 pratica aggiornata');
      expect(buildNotificationMessage(sum({ totalUpdated: 4 }))).toBe('4 pratiche aggiornate');
    });

    it('appends the aggregate updated part after the new parts', () => {
      expect(
        buildNotificationMessage(
          sum({ totalNew: 3, totalUpdated: 5, newByCategory: { edilizia: 1, commercio: 2 } })
        )
      ).toBe('1 nuova pratica, 2 nuove attività e 5 pratiche aggiornate');
    });

    it('single new + single updated', () => {
      expect(
        buildNotificationMessage(
          sum({ totalNew: 1, totalUpdated: 1, newByCategory: { edilizia: 1 } })
        )
      ).toBe('1 nuova pratica e 1 pratica aggiornata');
    });
  });

  describe('generic fallback when the category breakdown is absent', () => {
    it('uses the generic new part when newByCategory is empty but totalNew > 0', () => {
      expect(buildNotificationMessage(sum({ totalNew: 5 }))).toBe('5 nuove pratiche');
      expect(buildNotificationMessage(sum({ totalNew: 1 }))).toBe('1 nuova pratica');
    });

    it('combines the generic fallback with updates', () => {
      expect(buildNotificationMessage(sum({ totalNew: 3, totalUpdated: 2 }))).toBe(
        '3 nuove pratiche e 2 pratiche aggiornate'
      );
    });
  });

  describe('defensive input handling', () => {
    it('returns null for negative totals', () => {
      expect(buildNotificationMessage(sum({ totalNew: -1, totalUpdated: -5 }))).toBeNull();
    });

    it('ignores NaN totals', () => {
      expect(buildNotificationMessage(sum({ totalNew: NaN, totalUpdated: NaN }))).toBeNull();
      expect(buildNotificationMessage(sum({ totalUpdated: NaN, totalNew: 0 }))).toBeNull();
    });

    it('floors fractional per-category counts', () => {
      expect(buildNotificationMessage(sum({ totalNew: 2, newByCategory: { cantieri: 2.9 } }))).toBe(
        '2 nuovi cantieri'
      );
    });

    it('does not fire when fractional totals floor to zero', () => {
      expect(buildNotificationMessage(sum({ totalNew: 0.4, totalUpdated: 0.9 }))).toBeNull();
    });
  });
});
