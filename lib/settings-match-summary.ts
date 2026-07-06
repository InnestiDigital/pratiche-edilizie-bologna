/**
 * Pure copy builder for the Settings "matching permits" summary card.
 *
 * The Settings screen lets the user narrow the persistent feed filters (zones /
 * filing types / tags). This card previews how many of the locally-stored records
 * currently match those filters, so the impact of a toggle is visible immediately
 * instead of only after switching to the feed tab. Counting is done by the tested
 * `countPermits` (same `buildFeedWhere` the feed uses); this module owns only the
 * presentation logic — plural agreement + which caption to show — so it can be
 * unit-tested without a device, matching the repo's extract-pure-core pattern. The
 * noun is the category-neutral `recordNoun` (the DB holds all 5 categories).
 *
 * `match` / `total` are the number of permits matching the active filters and the
 * total in the local DB; either is `null` while its count is still loading.
 */

export interface MatchSummary {
  /** Big number line (localized), or `—` while loading. */
  number: string;
  /** Noun phrase under the number, agreeing with `match`. */
  label: string;
  /** Secondary caption explaining the number in context. */
  caption: string;
}

export function buildMatchSummary(match: number | null, total: number | null): MatchSummary {
  if (match === null || total === null) {
    return { number: '—', label: 'conteggio in corso…', caption: 'Sto contando le voci.' };
  }

  const number = match.toLocaleString('it-IT');
  const label = match === 1 ? 'voce corrisponde ai filtri' : 'voci corrispondono ai filtri';

  // No data synced yet — steer the user to the Aggiorna tab rather than implying
  // the filters hid everything.
  if (total === 0) {
    return {
      number: '0',
      label,
      caption: 'Nessun dato: scarica le voci dalla scheda Aggiorna.',
    };
  }

  // Data exists but the current filters exclude every record.
  if (match === 0) {
    return { number, label, caption: 'Nessuna voce con questi filtri. Prova ad allargarli.' };
  }

  // Filters don't narrow anything — every stored record is visible.
  if (match >= total) {
    return { number, label, caption: 'Tutte le voci del database sono visibili nel feed.' };
  }

  return { number, label, caption: `su ${total.toLocaleString('it-IT')} totali nel database` };
}
