// Pure, side-effect-free label for a feed month-section header count.
//
// The feed groups records under sticky month headers ("NOVEMBRE 2024"); the
// trailing bare number was ambiguous — a first-time user could misread the lone
// "3" as an unread/new badge rather than "3 records in this month". Naming the
// noun removes that ambiguity. The feed mixes all 5 categories, so the noun is the
// category-neutral `recordNoun`. Kept UI-free so the Italian pluralization is
// unit-testable under plain node (mirrors notification-message.ts).

import { recordNoun } from './record-noun';

/** Clamp to a non-negative integer; treats NaN / Infinity / negatives / floats defensively. */
function safeCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * "1 voce" / "3 voci" — the count of records in a feed month-section, with the
 * noun so the number is never mistaken for a status/unread badge. Junk counts
 * (NaN, Infinity, negative, fractional) clamp to "0 voci".
 */
export function sectionCountLabel(count: number): string {
  const n = safeCount(count);
  return `${n} ${recordNoun(n)}`;
}
