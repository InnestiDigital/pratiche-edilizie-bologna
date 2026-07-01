import { describe, it, expect } from 'vitest';
import { buildNotificationMessage } from './notification-message';

describe('buildNotificationMessage', () => {
  it('returns null when nothing is new or updated', () => {
    expect(buildNotificationMessage(0, 0)).toBeNull();
  });

  it('singular new permit', () => {
    expect(buildNotificationMessage(1, 0)).toBe('1 nuova pratica');
  });

  it('plural new permits', () => {
    expect(buildNotificationMessage(3, 0)).toBe('3 nuove pratiche');
  });

  it('singular updated permit', () => {
    expect(buildNotificationMessage(0, 1)).toBe('1 pratica aggiornata');
  });

  it('plural updated permits', () => {
    expect(buildNotificationMessage(0, 4)).toBe('4 pratiche aggiornate');
  });

  it('combines new and updated with a comma', () => {
    expect(buildNotificationMessage(2, 5)).toBe('2 nuove pratiche, 5 pratiche aggiornate');
  });

  it('combines singular new and singular updated', () => {
    expect(buildNotificationMessage(1, 1)).toBe('1 nuova pratica, 1 pratica aggiornata');
  });

  it('only lists the non-zero category', () => {
    expect(buildNotificationMessage(2, 0)).toBe('2 nuove pratiche');
    expect(buildNotificationMessage(0, 2)).toBe('2 pratiche aggiornate');
  });

  describe('defensive input handling', () => {
    it('treats negative counts as zero', () => {
      expect(buildNotificationMessage(-1, -5)).toBeNull();
      expect(buildNotificationMessage(-1, 2)).toBe('2 pratiche aggiornate');
    });

    it('ignores NaN counts', () => {
      expect(buildNotificationMessage(NaN, NaN)).toBeNull();
      expect(buildNotificationMessage(NaN, 1)).toBe('1 pratica aggiornata');
    });

    it('floors fractional counts', () => {
      expect(buildNotificationMessage(2.9, 0)).toBe('2 nuove pratiche');
      expect(buildNotificationMessage(1.4, 0)).toBe('1 nuova pratica');
    });

    it('does not fire when fractional counts floor to zero', () => {
      expect(buildNotificationMessage(0.4, 0.9)).toBeNull();
    });
  });
});
