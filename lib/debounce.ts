/**
 * Trailing-edge debounce: coalesces a burst of rapid calls into a single
 * invocation of `fn`, fired `delayMs` after the *last* call. Each new call
 * resets the timer, so `fn` runs once the caller pauses.
 *
 * Used by the feed search box: every keystroke would otherwise fire a full
 * multi-query feed reload (list + counts + favorites). Debouncing keeps the
 * input responsive and reloads only once the user stops typing.
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop any pending call without running it. */
  cancel(): void;
  /** Run a pending call immediately (no-op when nothing is pending). */
  flush(): void;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: A | null = null;

  const run = () => {
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    // args is always set when a timer fires, but guard keeps the types honest.
    if (args) fn(...args);
  };

  const debounced = (...args: A) => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      run();
    }
  };

  return debounced;
}
