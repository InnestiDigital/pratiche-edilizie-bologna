/**
 * Pure picker for the single date a feed card shows in its footer.
 *
 * A permit carries up to three dates — the request date (`source_updated_at`),
 * the closing date (`date_issued`) and the app-detected date (`first_seen_at`).
 * The card only has room for one, and the feed used to show `date_issued ??
 * source_updated_at` under a bare calendar icon with no label: the user could
 * not tell which date it was, and — worse — the DEFAULT feed sort is by request
 * date, so a card sorted by "Data richiesta" would silently display the *closing*
 * date whenever one existed. The shown date could disagree with the sort.
 *
 * This helper picks the date that matches the active sort and returns it with a
 * short Italian label + the timeline's icon for that field, so the footer reads
 * e.g. "Richiesta · 15/11/2024" and lines up with how the list is ordered.
 *
 * Kept pure (no native imports, no `new Date`) so it is unit-tested in Node; the
 * date is formatted through the TZ-safe `formatItDate` off the `YYYY-MM-DD`
 * string, and the icon is a plain glyph name the screen types against Ionicons.
 */

import { formatItDate } from './format-date';
import type { SortOption } from './build-feed-query';

export type FeedCardDateKind = 'richiesta' | 'chiusura' | 'rilevata';

export interface FeedCardDateInput {
  source_updated_at: string | null;
  date_issued: string | null;
  first_seen_at: string | null;
}

export interface FeedCardDate {
  kind: FeedCardDateKind;
  /** Short Italian label shown before the date. */
  label: string;
  /** Ionicons glyph name (resolved by the screen), matching the detail timeline. */
  icon: string;
  /** Display date, Italian `dd/mm/yyyy`. */
  date: string;
}

interface Field {
  kind: FeedCardDateKind;
  label: string;
  icon: string;
  raw: (p: FeedCardDateInput) => string | null;
}

// One entry per date a permit can carry. Labels are the compact card form of the
// detail timeline's ("Richiesta presentata" → "Richiesta"); icons match it so the
// feed and the detail Cronologia speak one visual language.
const FIELDS: Record<FeedCardDateKind, Field> = {
  richiesta: {
    kind: 'richiesta',
    label: 'Richiesta',
    icon: 'document-text-outline',
    raw: (p) => p.source_updated_at,
  },
  chiusura: {
    kind: 'chiusura',
    label: 'Conclusa',
    icon: 'checkmark-circle-outline',
    raw: (p) => p.date_issued,
  },
  rilevata: {
    kind: 'rilevata',
    label: 'Rilevata',
    icon: 'eye-outline',
    raw: (p) => p.first_seen_at,
  },
};

// The date to prefer for each sort, then the fallbacks (in case the preferred
// field is NULL for this permit). `first_seen_at` is always set, so every list
// still resolves to a date — but the primary field always leads when present, so
// the shown date agrees with the column the feed is ordered by.
const PREFERENCE: Record<SortOption, FeedCardDateKind[]> = {
  request_newest: ['richiesta', 'chiusura', 'rilevata'],
  request_oldest: ['richiesta', 'chiusura', 'rilevata'],
  closing_newest: ['chiusura', 'richiesta', 'rilevata'],
  newest: ['rilevata', 'richiesta', 'chiusura'],
  oldest: ['rilevata', 'richiesta', 'chiusura'],
};

/**
 * Pick the labelled date a feed card should show for the given sort.
 *
 * Walks the sort's preference order and returns the first field with a
 * confidently formattable date. Returns `null` only if the permit has no
 * parseable date at all (all three fields null/blank), in which case the card
 * renders no date row.
 */
export function feedCardDate(
  permit: FeedCardDateInput,
  sort: SortOption | undefined
): FeedCardDate | null {
  const order = PREFERENCE[sort ?? 'newest'];
  for (const kind of order) {
    const field = FIELDS[kind];
    const formatted = formatItDate(field.raw(permit));
    if (formatted !== null) {
      return { kind: field.kind, label: field.label, icon: field.icon, date: formatted };
    }
  }
  return null;
}
