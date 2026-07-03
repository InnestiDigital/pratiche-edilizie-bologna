/**
 * Pure helper for the feed's optimistic saved-permit set.
 *
 * The feed keeps the set of saved `source_id`s in state so each card can render
 * its bookmark from one query (see `listFavoriteIds`). When a card's bookmark is
 * tapped, `toggleFavorite` writes the DB and reports the resulting saved state;
 * this helper folds that result back into the in-memory set so the tapped card
 * flips immediately, without reloading the whole feed.
 *
 * Kept pure (no native imports) and returning a NEW Set — never mutating the
 * input — so React sees a fresh identity and re-renders, and so the tiny
 * add/remove contract is unit-tested in Node.
 */

/**
 * Return a new set reflecting `sourceId`'s post-toggle saved state: added when
 * `nowSaved` is true, removed when false. The input set is left untouched.
 */
export function applyFavoriteToggle(
  current: ReadonlySet<string>,
  sourceId: string,
  nowSaved: boolean
): Set<string> {
  const next = new Set(current);
  if (nowSaved) next.add(sourceId);
  else next.delete(sourceId);
  return next;
}
