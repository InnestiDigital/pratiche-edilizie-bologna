/**
 * Pure core for the feed's first-class "Salvati" quick-action (judge-flagged value
 * lever @ df5a087: saved voci exist on cards + as a buried filter toggle, but had
 * no first-class surface). This drives an always-visible bookmark button in the
 * search bar that jumps straight into (and out of) saved-only mode, so following a
 * permit is one tap to revisit — no opening the filter panel to hunt "Solo salvate".
 *
 * The device screen owns the Pressable + Ionicon; this module owns the show/hide,
 * the count badge (with a display cap), and the accessibility label, so all three
 * are unit-tested and can't drift from each other.
 */

/** Above this the badge shows "<cap>+" instead of an oversized exact number. */
export const SAVED_SHORTCUT_BADGE_CAP = 99;

export interface SavedShortcutState {
  /** Whether to render the button at all. */
  visible: boolean;
  /** Whether saved-only mode is currently active (drives the filled icon + fill). */
  active: boolean;
  /** Ionicon name — filled when active, outline when idle. */
  iconName: 'bookmark' | 'bookmark-outline';
  /** Count badge text, or null when there is nothing to badge (count 0). */
  badge: string | null;
  /** Screen-reader label describing the tap's effect in the current state. */
  accessibilityLabel: string;
}

/**
 * Derive the saved-shortcut button state from the live saved count and whether the
 * feed is currently in saved-only mode.
 *
 * Visibility: shown when there is at least one saved voce (something to jump to),
 * OR when saved-only mode is already active (so a user who un-saved the last row
 * while filtered can still tap to exit — never trap them in an empty saved feed
 * with no visible way out). A user who has never saved anything sees no dead button.
 *
 * The count is sanitized (a negative / NaN / fractional value from an unexpected
 * source collapses to 0) so a malformed input can never render a nonsense badge.
 */
export function savedShortcutState(savedCount: number, active: boolean): SavedShortcutState {
  const count = Number.isFinite(savedCount) && savedCount > 0 ? Math.floor(savedCount) : 0;
  const visible = count > 0 || active;
  const badge =
    count > 0
      ? count > SAVED_SHORTCUT_BADGE_CAP
        ? `${SAVED_SHORTCUT_BADGE_CAP}+`
        : String(count)
      : null;
  const iconName = active ? 'bookmark' : 'bookmark-outline';
  const accessibilityLabel = active
    ? 'Mostra tutte le voci'
    : count === 1
      ? 'Mostra solo la voce salvata'
      : count > 1
        ? `Mostra solo le ${count} voci salvate`
        : 'Voci salvate';
  return { visible, active, iconName, badge, accessibilityLabel };
}
