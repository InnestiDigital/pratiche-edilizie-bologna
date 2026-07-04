// Pure, side-effect-free label for a feed month-section header count.
//
// The feed groups permits under sticky month headers ("NOVEMBRE 2024"); the
// trailing bare number was ambiguous — a first-time user could misread the lone
// "3" as an unread/new badge rather than "3 permits in this month". Naming the
// noun removes that ambiguity. Kept UI-free so the Italian pluralization is
// unit-testable under plain node (mirrors notification-message.ts).

/** Clamp to a non-negative integer; treats NaN / Infinity / negatives / floats defensively. */
function safeCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * "1 pratica" / "3 pratiche" — the count of permits in a feed month-section,
 * with the noun so the number is never mistaken for a status/unread badge.
 * Junk counts (NaN, Infinity, negative, fractional) clamp to "0 pratiche".
 */
export function sectionCountLabel(count: number): string {
  const n = safeCount(count);
  return n === 1 ? `${n} pratica` : `${n} pratiche`;
}
