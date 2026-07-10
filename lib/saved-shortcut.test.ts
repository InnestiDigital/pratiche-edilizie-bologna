import { describe, expect, it } from 'vitest';
import { savedShortcutState, SAVED_SHORTCUT_BADGE_CAP } from './saved-shortcut';

describe('savedShortcutState', () => {
  it('hides the button when there are no saved voci and saved-only is off', () => {
    const s = savedShortcutState(0, false);
    expect(s.visible).toBe(false);
    expect(s.badge).toBeNull();
  });

  it('shows the button once at least one voce is saved', () => {
    const s = savedShortcutState(1, false);
    expect(s.visible).toBe(true);
    expect(s.badge).toBe('1');
  });

  it('stays visible while saved-only is active even if the last voce was un-saved (no trap)', () => {
    const s = savedShortcutState(0, true);
    expect(s.visible).toBe(true);
    expect(s.badge).toBeNull();
    expect(s.accessibilityLabel).toBe('Mostra tutte le voci');
  });

  it('uses the filled bookmark icon when active, the outline when idle', () => {
    expect(savedShortcutState(3, true).iconName).toBe('bookmark');
    expect(savedShortcutState(3, false).iconName).toBe('bookmark-outline');
  });

  it('agrees in number: singular label for exactly one saved voce', () => {
    expect(savedShortcutState(1, false).accessibilityLabel).toBe('Mostra solo la voce salvata');
  });

  it('agrees in number: plural label with the count for more than one', () => {
    expect(savedShortcutState(4, false).accessibilityLabel).toBe('Mostra solo le 4 voci salvate');
  });

  it('caps the badge display so a large count never overflows the pill', () => {
    expect(savedShortcutState(SAVED_SHORTCUT_BADGE_CAP, false).badge).toBe(
      String(SAVED_SHORTCUT_BADGE_CAP)
    );
    expect(savedShortcutState(SAVED_SHORTCUT_BADGE_CAP + 1, false).badge).toBe(
      `${SAVED_SHORTCUT_BADGE_CAP}+`
    );
  });

  it('sanitizes a malformed count (negative / NaN / fractional) to hidden or floored', () => {
    expect(savedShortcutState(-5, false).visible).toBe(false);
    expect(savedShortcutState(Number.NaN, false).visible).toBe(false);
    expect(savedShortcutState(Number.POSITIVE_INFINITY, false).visible).toBe(false);
    expect(savedShortcutState(2.9, false).badge).toBe('2');
  });
});
