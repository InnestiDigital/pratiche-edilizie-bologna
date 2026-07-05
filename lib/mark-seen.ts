/**
 * Pure core for the feed's "reading a permit marks it read" behavior.
 *
 * Opening a permit's detail marks THAT permit seen in the DB (its NUOVO flag is
 * cleared). When the feed regains focus we must reflect that on the already-loaded
 * cards WITHOUT reloading the list — a reload would reset scroll + pagination and
 * jump the user away from where they were. So the feed queries the still-new
 * `source_id`s and folds them into its in-memory rows with this helper.
 *
 * `applySeenToList` flips `is_new: 1 → 0` for any loaded row whose `source_id` is
 * no longer in the still-new set, and — crucially — returns the SAME array
 * reference when nothing changed, so the common no-op focus (nothing was read
 * since last time) triggers no React re-render at all. When something did change,
 * only the flipped rows get a new object identity; unchanged rows keep theirs, so
 * the SectionList re-renders just the cards that lost their NUOVO badge.
 */
export function applySeenToList<T extends { source_id: string; is_new: number }>(
  list: readonly T[],
  stillNewIds: ReadonlySet<string>
): T[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.is_new === 1 && !stillNewIds.has(item.source_id)) {
      changed = true;
      return { ...item, is_new: 0 };
    }
    return item;
  });
  // Preserve referential identity of the whole array when no row flipped, so the
  // caller's `setPermits(prev => applySeenToList(prev, ids))` is a true no-op.
  return changed ? next : (list as T[]);
}
