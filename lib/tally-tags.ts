/**
 * Count, across a set of permits, how many carry each topic tag.
 *
 * A permit's `tags` column is `JSON.stringify(string[])` (see `normalize.ts`);
 * each tag a permit carries contributes +1 to that tag's tally, so one permit
 * with `['con_lavori', 'parziale']` counts toward BOTH — the tally answers "how
 * many permits carry this label", not "how many labels exist". The returned map
 * is keyed by the raw tag slug (e.g. `con_lavori`), matching `TAG_LABELS` keys.
 *
 * This is the pure, tested core mirroring the native `getStats` `json_each`
 * GROUP BY; the web screenshot shim derives `byTag` from it so the fixture stats
 * never drift from the fixture rows. Defensive like `parsePermitTags`: a row
 * whose `tags` is malformed JSON, a non-array, or holds non-string elements is
 * skipped for those bad values rather than throwing.
 */
export function tallyTags(permits: readonly { tags: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const permit of permits) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(permit.tags);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const tag of parsed) {
      if (typeof tag !== 'string') continue;
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}
