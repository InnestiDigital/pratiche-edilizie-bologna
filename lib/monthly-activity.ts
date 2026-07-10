/**
 * Pure builder for the sync-screen "Pratiche per mese" (monthly activity) chart.
 *
 * `getStats` returns a raw `"YYYY-MM" -> count` map straight off a
 * `GROUP BY substr(source_updated_at, 1, 7)` — i.e. permits bucketed by the
 * month their request was filed (`richiesta_data` → `source_updated_at`). This
 * turns that map into a render-ready series for a small vertical bar chart: a
 * contiguous run of months (gaps filled with zero), each entry carrying its
 * Italian month label and a bounded bar height. The window length is adaptive
 * (see `buildMonthlyActivity`).
 *
 * The window is anchored to the **most recent month present in the data**, not
 * to the wall clock. A local snapshot is often weeks or months stale (the app
 * works fully offline and re-syncs in the background), so anchoring to "now"
 * would routinely render an all-zero chart; anchoring to the latest data month
 * always shows the meaningful tail of what the user actually has. It also keeps
 * this module pure — no `new Date()`, fully deterministic, unit-tested in Node
 * exactly like `buildStatusBreakdown` / `summarizeSyncResults`.
 *
 * The window **length is adaptive** when the caller does not pin one: it snaps
 * to the data's own month span (earliest to latest), clamped to
 * `[MIN, MAX]_WINDOW`. A fixed 6-month trailing window silently dropped every
 * record older than the tail (sparse real data spread over a year rendered
 * mostly empty months and only a fraction of what was stored); snapping to the
 * span surfaces more of the actual distribution, while a very wide history
 * still stays legible (older-than-MAX months roll off, captioned honestly by
 * the sync screen). A caller that passes an explicit `months` keeps the old
 * fixed-window behaviour verbatim.
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

/**
 * Fallback / lower bound for the adaptive window. When the data spans fewer than
 * this many months the chart still shows this many (a single-month snapshot reads
 * as a small chart, not a lone bar). Also the default any caller inherits when it
 * pins no window and the span is narrow.
 */
export const MONTHLY_ACTIVITY_WINDOW = 6;

/** Adaptive window floor — alias of {@link MONTHLY_ACTIVITY_WINDOW}, named for intent. */
export const MONTHLY_ACTIVITY_MIN_WINDOW = MONTHLY_ACTIVITY_WINDOW;

/**
 * Adaptive window ceiling. Data spanning more than this many months rolls its
 * oldest months off-chart (the sync screen captions the dropped total) so the
 * small phone bar chart stays legible instead of cramming a multi-year history.
 */
export const MONTHLY_ACTIVITY_MAX_WINDOW = 12;

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
 * Build the monthly-activity series for the chart.
 *
 * When `months` is omitted the window length is **adaptive**: it snaps to the
 * data's own month span, clamped to `[MIN, MAX]_WINDOW`, so more of what the
 * user actually has stored surfaces instead of a fixed trailing tail. Pass an
 * explicit `months` to force a fixed-length trailing window (the pre-adaptive
 * behaviour, used by the focused unit tests).
 *
 * Returns `[]` when there is no usable data (empty/garbage map, or an explicit
 * non-positive window), so the UI can skip the card entirely. Otherwise the
 * result is a contiguous run of months, oldest → newest.
 */
export function buildMonthlyActivity(
  byMonth: Record<string, number>,
  months?: number
): MonthlyActivityEntry[] {
  // An explicitly pinned window that is non-positive / non-finite yields no chart.
  const pinned = months !== undefined;
  if (pinned) {
    const fixed = Number.isFinite(months) ? Math.floor(months as number) : 0;
    if (fixed <= 0) return [];
  }

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

  // Fixed length when pinned; otherwise snap to the data's span (earliest →
  // latest), clamped to [MIN, MAX] so a single-month snapshot still reads as a
  // chart and a multi-year history stays legible.
  const window = pinned
    ? Math.floor(months as number)
    : Math.min(
        MONTHLY_ACTIVITY_MAX_WINDOW,
        Math.max(MONTHLY_ACTIVITY_MIN_WINDOW, anchor - Math.min(...clean.keys()) + 1)
      );

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
 * Total voci the chart's visible window actually represents — the sum of every
 * bar's count. Deliberately less than `getStats().total` whenever some records
 * are not bucketed here: eventi carry no `source_updated_at` (their start is a
 * future date, so they never get a request-month bar) and any record whose month
 * falls outside the trailing window is off-chart too. The sync screen compares
 * this against the grand total to caption the gap, so "14 voci totali" over bars
 * that sum to 8 no longer reads as a miscount.
 */
export function monthlyActivityWindowTotal(entries: MonthlyActivityEntry[]): number {
  return entries.reduce((sum, e) => sum + e.count, 0);
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
