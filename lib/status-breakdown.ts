/**
 * Pure builder for the sync-screen "Per Stato" (by-status) breakdown card.
 *
 * `getStats` returns a raw `status -> count` map straight off a `GROUP BY status`.
 * This turns that map into an ordered, render-ready list: each entry carries its
 * Italian label, the shared status accent color, an integer count and a bounded
 * percentage of the total — so the sync screen can render the breakdown without
 * any counting, sorting or color logic of its own (mirrors how the dataset
 * composition bar and per-quartiere list are fed).
 *
 * Kept pure (no native imports) so it is unit-tested in Node. It also sanitizes
 * the count map defensively — a `getStats` that ever yields a negative, NaN,
 * fractional or Infinity count must not render a bogus bar — exactly like
 * `summarizeSyncResults` guards the notification counts.
 */

import { STATUS_LABELS } from './constants';

/**
 * Status accent colors — the same palette the feed and detail screens use for
 * the status dot, centralized here as pure data so the by-status breakdown reads
 * as one visual language with the rest of the app.
 */
export const STATUS_COLORS: Record<string, string> = {
  rilasciata: '#22c55e',
  rilasciata_con_prescrizioni: '#eab308',
  diniegata: '#ef4444',
  annullata: '#ef4444',
  archiviata: '#9ca3af',
  decaduta: '#9ca3af',
  rinunciata: '#9ca3af',
  in_attesa: '#3b82f6',
  concluso: '#22c55e',
  altro: '#9ca3af',
};

/** Fallback for a status with no known color (unmapped/legacy value). */
const FALLBACK_COLOR = '#9ca3af';

export interface StatusBreakdownEntry {
  /** Raw status key (e.g. `rilasciata`). */
  status: string;
  /** Italian label shown next to the dot. */
  label: string;
  /** Dot / bar accent color (hex). */
  color: string;
  /** Sanitized permit count for this status (integer ≥ 1). */
  count: number;
  /** Share of the grand total, clamped to `0..100`. `0` when total ≤ 0. */
  pct: number;
}

/** Keep only counts that can render a real bar: finite, positive integers. */
function sanitizeCount(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  return n > 0 ? n : null;
}

/**
 * Build the ordered by-status breakdown for the sync stats card.
 *
 * Entries are sorted by count descending; ties break by label (ascending,
 * locale-aware) so the order is deterministic. Statuses with no usable count are
 * dropped rather than shown as an empty row.
 */
export function buildStatusBreakdown(
  byStatus: Record<string, number>,
  total: number
): StatusBreakdownEntry[] {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;

  return Object.entries(byStatus)
    .map(([status, raw]) => {
      const count = sanitizeCount(raw);
      if (count === null) return null;
      const pct = safeTotal > 0 ? Math.min(100, Math.max(0, (count / safeTotal) * 100)) : 0;
      return {
        status,
        label: STATUS_LABELS[status] ?? STATUS_LABELS.altro,
        color: STATUS_COLORS[status] ?? FALLBACK_COLOR,
        count,
        pct,
      };
    })
    .filter((e): e is StatusBreakdownEntry => e !== null)
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label, 'it')
    );
}
