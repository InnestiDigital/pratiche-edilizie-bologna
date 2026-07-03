/**
 * Pure grouping of feed permits into **date section headers**, so the feed reads
 * like a scannable timeline (the Photos / Mail / Files pattern) instead of one
 * flat list. Each section is a calendar month — "Novembre 2024", "Ottobre 2024"
 * — of the same date the feed is ordered by.
 *
 * The month bucketed is the one the active sort keys on: sorting by request date
 * groups by request month, by closing date groups by closing month, etc. That
 * reuses `pickFeedDateField` (the single source of truth #54 already uses to pick
 * a card's labelled date), so a card's footer date and its section header always
 * agree with each other and with the list order.
 *
 * Grouping is a stable **adjacent-run** partition: it never reorders permits, it
 * only inserts a header whenever the month changes as you walk the (already
 * SQL-sorted) list. Two non-adjacent runs of the same month therefore yield two
 * sections — honest to what the sort produced. The bucket id is deliberately NOT
 * named `key`: SectionList treats a section's `key` prop as its React key (which
 * must be unique), so we expose `bucket` and let SectionList fall back to indices.
 *
 * Kept pure (no native imports, no `new Date`) so it is unit-tested in Node.
 */

import { pickFeedDateField, type FeedCardDateInput } from './feed-card-date';
import type { SortOption } from './build-feed-query';

/** Italian month names, index 0 = Gennaio. */
const MONTHS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

/** Stable key + Italian title for the "no parseable date" bucket. */
export const NO_DATE_KEY = 'none';
const NO_DATE_TITLE = 'Senza data';

/** Leading `YYYY-MM` of an ODS date string (handles a trailing time suffix). */
const YEAR_MONTH = /^(\d{4})-(\d{2})/;

export interface FeedSection<T> {
  /** Month bucket id (`YYYY-MM`) or `NO_DATE_KEY`. Not unique across the list. */
  bucket: string;
  /** Header text: `"Novembre 2024"` or `"Senza data"`. */
  title: string;
  /** The permits in this run, in their original (sorted) order. */
  data: T[];
}

/** Map a raw ODS date string to its `{ bucket, title }`, or `null` if unparseable. */
function monthBucket(raw: string): { bucket: string; title: string } | null {
  const match = YEAR_MONTH.exec(raw.trim());
  if (!match) return null;
  const [, year, month] = match;
  const idx = Number(month) - 1;
  if (idx < 0 || idx > 11) return null;
  return { bucket: `${year}-${month}`, title: `${MONTHS_IT[idx]} ${year}` };
}

/**
 * Partition an already-sorted permit list into calendar-month sections keyed on
 * the active sort's date field. Adjacent permits sharing a month land in one
 * section; a month change starts a new one. Permits with no parseable date fall
 * into a trailing `"Senza data"` section (only ever created when one occurs).
 */
export function groupPermitsBySection<T extends FeedCardDateInput>(
  permits: T[],
  sort: SortOption | undefined
): FeedSection<T>[] {
  const sections: FeedSection<T>[] = [];
  for (const permit of permits) {
    const picked = pickFeedDateField(permit, sort);
    const month = picked ? monthBucket(picked.raw) : null;
    const bucket = month?.bucket ?? NO_DATE_KEY;
    const title = month?.title ?? NO_DATE_TITLE;

    const last = sections[sections.length - 1];
    if (last && last.bucket === bucket) last.data.push(permit);
    else sections.push({ bucket, title, data: [permit] });
  }
  return sections;
}
