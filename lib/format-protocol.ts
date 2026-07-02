/**
 * Format a permit `source_id` (`<dataset>-<year>-<number>`, e.g. `PDC-2024-000481`;
 * built by `makeSourceId` in normalize.ts) into a clean human protocol string
 * `<number>/<year>` (e.g. `000481/2024`).
 *
 * The dataset prefix is intentionally dropped: it duplicates the filing-type badge
 * shown right next to the protocol on both the feed card and the detail header, so
 * rendering the raw `source_id` there was redundant and developer-facing.
 *
 * Never throws. Degenerate/legacy shapes degrade gracefully rather than producing an
 * empty or misleading slot:
 *  - missing number -> the year alone
 *  - missing year   -> the number alone
 *  - neither present -> the raw source_id (a caller never renders an empty protocol)
 */
export function formatProtocol(sourceId: string | null | undefined): string {
  if (!sourceId) return '';
  const parts = sourceId.split('-');
  const year = (parts[1] ?? '').trim();
  const number = (parts[2] ?? '').trim();
  if (number && year) return `${number}/${year}`;
  if (number) return number;
  if (year) return year;
  return sourceId.trim();
}
