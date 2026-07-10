import { type FilingType } from './constants';
import { CATEGORIES, type Category } from './sources';

/**
 * Pure helpers for the feed's category quick-filter row (the horizontally
 * scrollable "Tutte · Edilizia · Cantieri · …" segment at the top of the feed).
 *
 * The feed screen owns three pieces of session state — the followed set (from
 * preferences' `interests`) and a session-local `selected` category (null = all
 * followed) — and derives everything below from them. Keeping the derivation
 * pure means the "what does the WHERE see", "does the filing sub-row show" and
 * "is the row even worth rendering" decisions are unit-tested without a device.
 *
 * The category selection is SESSION-local and independent of Settings › Interessi:
 * narrowing the feed to one category here never mutates the persisted follow-set,
 * so "just events today" is one tap and reversible with "Tutte" — no global
 * unfollow/refollow dance.
 */

/**
 * The category scope actually applied to the feed WHERE (`FeedFilters.categories`).
 *
 * A session `selected` category wins ONLY when it is among the followed set — an
 * orphaned selection (the user unfollowed that category in Settings after picking
 * it) falls back to all followed categories rather than filtering the feed to an
 * empty, un-clearable state. `null` selection = all followed (no narrowing).
 */
export function effectiveFeedCategories(
  selected: Category | null,
  followed: Category[]
): Category[] {
  if (selected && followed.includes(selected)) return [selected];
  return followed;
}

/**
 * Whether the edilizia filing-type sub-row (PDC / SCIA / CILA) should render.
 *
 * The filing chips are edilizia-only sub-filters — meaningless for a
 * cantiere/evento/segnalazione — so they show only when the feed is currently
 * scoped to edilizia ALONE. Pass the result of {@link effectiveFeedCategories}.
 * This keeps the historical always-visible filing row for a user who follows
 * only edilizia, while hiding it the moment the feed mixes categories or focuses
 * a non-edilizia one.
 */
export function showFilingSubRow(effective: Category[]): boolean {
  return effective.length === 1 && effective[0] === 'edilizia';
}

/**
 * The filing-type filter (PDC / SCIA / CILA) actually applied to the feed WHERE.
 *
 * The filing chips are edilizia-only sub-filters, shown ONLY when the feed is
 * scoped to edilizia alone ({@link showFilingSubRow}). Their `activeTypes`
 * selection is session-persistent, but the chip ROW is hidden the moment the feed
 * mixes categories or focuses a non-edilizia one — so a previously-narrowed
 * selection (e.g. only PDC) must NOT keep filtering out of that scope, or it would
 * silently drop edilizia SCIA/CILA rows with no visible chip left to clear it.
 *
 * Out of edilizia-alone scope this returns the full preferred set (the followed
 * filing types) — no narrowing beyond preferences. In scope it returns the active
 * selection intersected with the preferred set. Gating the query here (rather than
 * resetting `activeTypes` on every category switch) keeps ONE source of truth for
 * "does the filing filter apply" and preserves the user's chip selection for when
 * they narrow back to edilizia. `preferredTypes` is the persisted followed set
 * (`preferences.filingTypes`); `effective` is {@link effectiveFeedCategories}'s output.
 */
export function effectiveFilingTypes(
  activeTypes: readonly FilingType[],
  preferredTypes: readonly FilingType[],
  effective: Category[]
): FilingType[] {
  if (!showFilingSubRow(effective)) return [...preferredTypes];
  return activeTypes.filter((t) => preferredTypes.includes(t));
}

/**
 * The category chips to render, in canonical `CATEGORIES` order, restricted to
 * the followed set. Ordering is driven by the registry (not the stored-prefs
 * order) so the row reads the same regardless of how the user toggled follows.
 */
export function categoryChoices(followed: Category[]): Category[] {
  return CATEGORIES.filter((c) => followed.includes(c));
}

/**
 * Whether the category quick-filter row is worth showing at all: only when at
 * least two categories are followed. A single followed category has nothing to
 * switch between, so the row would be a lone dead chip — hide it and let the
 * feed fall through to the filing sub-row (edilizia) or nothing.
 */
export function showCategoryRow(followed: Category[]): boolean {
  return categoryChoices(followed).length >= 2;
}
