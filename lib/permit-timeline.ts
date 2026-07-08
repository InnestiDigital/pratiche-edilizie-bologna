/**
 * Pure builder for the permit-detail "Cronologia" timeline.
 *
 * The detail screen used to render a permit's three key dates as a flat list of
 * info rows in a fixed source order (`date_issued`, then `source_updated_at`,
 * then `first_seen_at`) — which could show "Data chiusura" above "Data richiesta"
 * even when the request predated the closing. This builder turns those dates into
 * an ordered list of events sorted by the actual date, so the timeline reads
 * chronologically regardless of field order or messy open-data ordering.
 *
 * Kept pure (no native imports, no `new Date`) so it is unit-tested in Node:
 * dates are compared and formatted straight off the `YYYY-MM-DD` string prefix
 * (see `formatItDate` for why we avoid `new Date` — TZ-midnight day shifts).
 *
 * Icon names are plain strings here (the lib must stay free of the native
 * `Ionicons` import); the detail screen types them against the glyph map.
 */

import { formatItDate } from './format-date';
import { CATEGORY_TIMELINE_LABELS, type Category } from './sources';

export type PermitTimelineKey = 'richiesta' | 'chiusura' | 'rilevata';

export interface PermitTimelineEvent {
  key: PermitTimelineKey;
  /** Italian label shown next to the dot. */
  label: string;
  /** Ionicons glyph name (resolved by the screen). */
  icon: string;
  /** Dot / accent color (hex). */
  color: string;
  /** Display date, Italian `dd/mm/yyyy`. */
  date: string;
}

/** The minimal permit shape the timeline needs — a structural subset of `Permit`. */
export interface PermitTimelineInput {
  /** Drives the category-appropriate `richiesta` / `chiusura` labels. */
  category: Category;
  source_updated_at: string | null;
  date_issued: string | null;
  first_seen_at: string | null;
}

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Sort key for an ODS/ISO date string: its leading `YYYY-MM-DD`, which is
 * lexicographically ordered. Returns `null` when there is no parseable prefix,
 * so undated entries are dropped rather than mis-sorted.
 */
function sortKey(raw: string | null): string | null {
  if (raw == null) return null;
  const match = ISO_DATE_PREFIX.exec(raw.trim());
  return match ? match[1] : null;
}

interface Candidate {
  key: PermitTimelineKey;
  label: string;
  icon: string;
  color: string;
  raw: string | null;
}

/**
 * Build the chronological event list for a permit's detail timeline.
 *
 * Events with no confidently parseable date are omitted. The result is sorted
 * ascending by date (oldest first); ties keep a stable request → closing →
 * detected order so a same-day request and closing read naturally.
 */
export function buildPermitTimeline(permit: PermitTimelineInput): PermitTimelineEvent[] {
  const labels = CATEGORY_TIMELINE_LABELS[permit.category];
  const candidates: Candidate[] = [
    {
      key: 'richiesta',
      label: labels.richiesta,
      icon: 'document-text-outline',
      color: '#8B7355',
      raw: permit.source_updated_at,
    },
    {
      key: 'chiusura',
      label: labels.chiusura,
      icon: 'checkmark-circle-outline',
      color: '#22c55e',
      raw: permit.date_issued,
    },
    {
      key: 'rilevata',
      label: "Rilevata dall'app",
      icon: 'eye-outline',
      color: '#9B2335',
      raw: permit.first_seen_at,
    },
  ];

  return candidates
    .map((c, index) => ({ c, index, sk: sortKey(c.raw) }))
    .filter((e): e is { c: Candidate; index: number; sk: string } => e.sk !== null)
    .sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : a.index - b.index))
    .map(({ c }) => ({
      key: c.key,
      label: c.label,
      icon: c.icon,
      color: c.color,
      // `raw` is non-null here (sortKey filtered nulls); formatItDate never throws.
      date: formatItDate(c.raw) ?? (c.raw as string),
    }));
}
