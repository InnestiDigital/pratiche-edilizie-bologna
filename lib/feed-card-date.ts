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
import { CATEGORY_TIMELINE_LABELS, type Category } from './sources';

export type FeedCardDateKind = 'richiesta' | 'chiusura' | 'rilevata';

export interface FeedCardDateInput {
  /** Drives the category-appropriate `chiusura` label + icon (see `chiusuraLabelIcon`). */
  category: Category;
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
    // Completion default (edilizia/commercio/segnalazioni); `chiusuraLabelIcon`
    // overrides these for categories whose `date_issued` is merely scheduled.
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
 * The `request_*` sorts order the feed by `REQUEST_DATE_SQL` (see
 * `build-feed-query.ts`), which is `source_updated_at` for every category EXCEPT
 * eventi — an event carries no request date (its `source_updated_at` is NULL), so
 * the feed orders it by its discovery date (`first_seen_at`) instead. The default
 * `PREFERENCE['request_newest']` order leads with `richiesta` then `chiusura`, so
 * an eventi card would fall through the NULL `richiesta` to `chiusura`
 * (`date_issued` = the event's FUTURE end date) — a date uncorrelated with the
 * `first_seen_at` the row is actually ordered by. That desynced the card footer
 * AND the month section header from the list order (non-monotonic headers under
 * the default sort for anyone following eventi). Mirror the SQL: under a
 * `request_*` sort an event's leading date is `rilevata` (`first_seen_at`), so the
 * footer/header agree with the ordering column. Returns `null` (use `PREFERENCE`)
 * for any non-eventi row or non-`request_*` sort.
 */
function requestSortDateOrder(
  permit: FeedCardDateInput,
  sort: SortOption | undefined
): FeedCardDateKind[] | null {
  if (permit.category !== 'eventi') return null;
  if (sort !== 'request_newest' && sort !== 'request_oldest') return null;
  return ['rilevata', 'chiusura', 'richiesta'];
}

/**
 * The `chiusura` field's label + icon depend on what `date_issued` MEANS for the
 * category, exactly as `buildPermitTimeline` branches on `chiusuraKind`: a real
 * conclusion (`completion` — edilizia/commercio/segnalazioni) reads as a compact
 * "Conclusa" with a done-check; a merely-scheduled date (`scheduled` — a
 * cantiere's "Fine lavori", an evento's future "Data dell'evento") takes the
 * category's own date name + a neutral calendar marker, so the card never claims
 * an in-corso/in-programma record is "Conclusa" on a date that hasn't happened.
 * `richiesta`/`rilevata` are category-independent and keep their static labels.
 */
function resolveLabelIcon(field: Field, category: Category): { label: string; icon: string } {
  if (field.kind !== 'chiusura') return { label: field.label, icon: field.icon };
  const labels = CATEGORY_TIMELINE_LABELS[category];
  return labels.chiusuraKind === 'completion'
    ? { label: field.label, icon: field.icon }
    : { label: labels.chiusura, icon: 'calendar-outline' };
}

/** The date field chosen for a permit under a sort — with its raw ODS string. */
export interface PickedFeedDateField {
  kind: FeedCardDateKind;
  label: string;
  icon: string;
  /** The raw ODS date string of the chosen field (before Italian formatting). */
  raw: string;
}

/**
 * Pick which of a permit's dates leads for the given sort, returning the raw ODS
 * string so callers can both format it (feed card) and bucket by month (feed
 * section headers) from one source of truth.
 *
 * Walks the sort's preference order and returns the first field whose date is
 * confidently formattable (`formatItDate` non-null). Returns `null` only when the
 * permit has no parseable date at all (all three fields null/blank).
 */
export function pickFeedDateField(
  permit: FeedCardDateInput,
  sort: SortOption | undefined
): PickedFeedDateField | null {
  const order = requestSortDateOrder(permit, sort) ?? PREFERENCE[sort ?? 'newest'];
  for (const kind of order) {
    const field = FIELDS[kind];
    const raw = field.raw(permit);
    if (formatItDate(raw) !== null) {
      // raw is non-null here: formatItDate only returns non-null for a non-blank string.
      const { label, icon } = resolveLabelIcon(field, permit.category);
      return { kind: field.kind, label, icon, raw: raw as string };
    }
  }
  return null;
}

/**
 * Pick the labelled date a feed card should show for the given sort.
 *
 * Returns `null` only if the permit has no parseable date at all (all three
 * fields null/blank), in which case the card renders no date row.
 */
export function feedCardDate(
  permit: FeedCardDateInput,
  sort: SortOption | undefined
): FeedCardDate | null {
  const picked = pickFeedDateField(permit, sort);
  if (picked === null) return null;
  // formatItDate(picked.raw) is non-null: pickFeedDateField only accepts a field
  // whose formatItDate is non-null, so this re-format cannot be null.
  return {
    kind: picked.kind,
    label: picked.label,
    icon: picked.icon,
    date: formatItDate(picked.raw) as string,
  };
}
