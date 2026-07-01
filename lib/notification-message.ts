// Pure, side-effect-free builder for the "new permits" notification body.
//
// Kept in its own module (no expo / react-native imports) so the brittle
// Italian pluralization can be unit-tested under a plain node environment,
// and so the domain signaling (what text to show) is separated from the UI
// concern (scheduling the OS notification) in notifications.ts.

/** Clamp to a non-negative integer; treats NaN / negatives / floats defensively. */
function safeCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** "1 nuova pratica" / "3 nuove pratiche" */
function newPart(count: number): string {
  return count === 1 ? `${count} nuova pratica` : `${count} nuove pratiche`;
}

/** "1 pratica aggiornata" / "3 pratiche aggiornate" */
function updatedPart(count: number): string {
  return count === 1 ? `${count} pratica aggiornata` : `${count} pratiche aggiornate`;
}

/**
 * Build the notification body for a sync run.
 *
 * Returns `null` when there is nothing worth notifying about (no genuinely-new
 * and no updated permits) — callers use that to skip firing a notification, so
 * a no-op sync never pings the user.
 */
export function buildNotificationMessage(newCount: number, updatedCount: number): string | null {
  const fresh = safeCount(newCount);
  const changed = safeCount(updatedCount);

  if (fresh === 0 && changed === 0) return null;

  const parts: string[] = [];
  if (fresh > 0) parts.push(newPart(fresh));
  if (changed > 0) parts.push(updatedPart(changed));

  return parts.join(', ');
}
