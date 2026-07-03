/**
 * Pure builder for the sync-screen "Pratiche per mese" (monthly activity) chart.
 *
 * `getStats` returns a raw `"YYYY-MM" -> count` map straight off a
 * `GROUP BY substr(source_updated_at, 1, 7)` — i.e. permits bucketed by the
 * month their request was filed (`richiesta_data` → `source_updated_at`). This
 * turns that map into a fixed-length, render-ready series for a small vertical
 * bar chart: the trailing N months of the dataset, gaps filled with zero, each
 * entry carrying its Italian month label and a bounded bar height.
 *
 * The window is anchored to the **most recent month present in the data**, not
 * to the wall clock. A local snapshot is often weeks or months stale (the app
 * works fully offline and re-syncs in the background), so anchoring to "now"
 * would routinely render an all-zero chart; anchoring to the latest data month
 * always shows the meaningful tail of what the user actually has. It also keeps
 * this module pure — no `new Date()`, fully deterministic, unit-tested in Node
 * exactly like `buildStatusBreakdown` / `summarizeSyncResults`.
 *
 * Defensive like its sibling stat builders: month keys that are not a real
 * `YYYY-MM` and counts that are not finite positive integers are dropped rather
 * than rendered as a bogus bar.
 */

/** Italian three-letter month abbreviations, index 0 = gennaio. */
const MONTH_ABBR_IT = [
  'gen',
  'feb',
  'mar',
  'apr',
  'mag',
  'giu',
  'lug',
  'ago',
  'set',
  'ott',
  'nov',
  'dic',
];

/** How many trailing months the chart shows by default. */
export const MONTHLY_ACTIVITY_WINDOW = 6;

export interface MonthlyActivityEntry {
  /** `YYYY-MM` bucket key. */
  monthKey: string;
  /** Italian short month label, e.g. `nov`. */
  label: string;
  /** Calendar year of this bucket. */
  year: number;
  /** Sanitized permit count filed in this month (integer ≥ 0). */
  count: number;
  /**
   * Bar height as a share of the busiest month in the window, `0..100`. The
   * peak month is `100`; a zero-count month is `0` (the UI still draws a faint
   * baseline so the column reads as "no activity", not "missing").
   */
  pct: number;
  /** True for the busiest month(s) in the window (count === window max, max > 0). */
  isPeak: boolean;
}

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

/** Parse a `YYYY-MM` key into a monotonic month index (year * 12 + month0), or null. */
function monthIndex(key: string): number | null {
  const m = MONTH_KEY_RE.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/** Turn a monotonic month index back into `{ key, year, month0 }`. */
function fromMonthIndex(idx: number): { key: string; year: number; month0: number } {
  const year = Math.floor(idx / 12);
  const month0 = idx - year * 12;
  const key = `${String(year).padStart(4, '0')}-${String(month0 + 1).padStart(2, '0')}`;
  return { key, year, month0 };
}

/** Keep only counts that can render a real bar: finite, non-negative integers. */
function sanitizeCount(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  return n >= 0 ? n : null;
}

/**
 * Build the trailing-`months` monthly-activity series for the chart.
 *
 * Returns `[]` when there is no usable data (empty/garbage map, or a
 * non-positive window), so the UI can skip the card entirely. Otherwise the
 * result always has exactly `months` entries, oldest → newest.
 */
export function buildMonthlyActivity(
  byMonth: Record<string, number>,
  months: number = MONTHLY_ACTIVITY_WINDOW
): MonthlyActivityEntry[] {
  const window = Number.isFinite(months) ? Math.floor(months) : 0;
  if (window <= 0) return [];

  // Clean the raw map: valid month key + sanitized count, merging any duplicate
  // keys that survive sanitation (a defensive belt — SQL yields distinct keys).
  const clean = new Map<number, number>();
  for (const [key, raw] of Object.entries(byMonth)) {
    const idx = monthIndex(key);
    if (idx === null) continue;
    const count = sanitizeCount(raw);
    if (count === null || count === 0) continue;
    clean.set(idx, (clean.get(idx) ?? 0) + count);
  }
  if (clean.size === 0) return [];

  // Anchor the window's right edge to the most recent month that has permits.
  const anchor = Math.max(...clean.keys());

  const counts: { idx: number; count: number }[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const idx = anchor - i;
    counts.push({ idx, count: clean.get(idx) ?? 0 });
  }

  const maxCount = Math.max(...counts.map((c) => c.count));

  return counts.map(({ idx, count }) => {
    const { key, year, month0 } = fromMonthIndex(idx);
    return {
      monthKey: key,
      label: MONTH_ABBR_IT[month0],
      year,
      count,
      pct: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0,
      isPeak: maxCount > 0 && count === maxCount,
    };
  });
}

/**
 * Compact "giu – nov 2024" / "ott 2024 – gen 2025" caption for the chart's date
 * range. Collapses the year when the whole window sits in one calendar year.
 * Returns `null` for an empty series.
 */
export function monthlyActivityRangeLabel(entries: MonthlyActivityEntry[]): string | null {
  if (entries.length === 0) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first.year === last.year) {
    return `${first.label} – ${last.label} ${last.year}`;
  }
  return `${first.label} ${first.year} – ${last.label} ${last.year}`;
}
