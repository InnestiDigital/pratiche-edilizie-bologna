import { SyncFetchError, SyncTimeoutError } from './fetch-page';

/**
 * Retry with exponential backoff for the sync transport.
 *
 * A background sync walks many pages against the Bologna open-data endpoint; a
 * single transient blip (a dropped socket, a 502 from the CDN, a rate-limit)
 * should not abort the whole dataset. This module retries only failures that a
 * retry can plausibly fix, and fails fast on the rest — a 404/410 (endpoint
 * gone), a 4xx client error, a schema-shape mismatch, or a caller cancellation.
 * It owns timing only: no knowledge of SQLite, datasets, or HTTP, so it stays
 * unit-testable with an injected clock.
 */

export const DEFAULT_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 500;
export const DEFAULT_MAX_DELAY_MS = 8_000;

/** Raised when a retry loop is cancelled mid-backoff via its {@link RetryOptions.signal}. */
export class RetryAbortError extends Error {
  constructor(message = 'Operazione annullata') {
    super(message);
    this.name = 'RetryAbortError';
  }
}

/**
 * Classify whether a sync transport failure is worth retrying.
 *
 * Retryable (transient): a {@link SyncTimeoutError}, or a {@link SyncFetchError}
 * that is a network-level failure (no status), a 429 rate-limit, or a 5xx
 * server error.
 *
 * Not retryable (permanent): a 4xx client error including 404/410 (the dataset
 * endpoint moved or was withdrawn — hammering it wastes battery), a
 * `SyncIngressError` (the payload shape changed; the next page won't differ),
 * a caller `AbortError`, or anything unrecognised.
 */
export function isRetryableSyncError(e: unknown): boolean {
  if (e instanceof SyncTimeoutError) return true;
  if (e instanceof SyncFetchError) {
    const status = e.status;
    if (status === undefined) return true; // network-level failure
    if (status === 429) return true; // rate-limited — back off and retry
    return status >= 500 && status <= 599; // server-side, transient
  }
  return false;
}

/**
 * Full-jitter exponential backoff: a delay drawn uniformly from
 * `[0, min(maxMs, baseMs * 2^attempt)]`. Jitter spreads a fleet of retries so
 * they don't stampede the endpoint in lockstep after a shared outage.
 *
 * @param attempt zero-based index of the *failed* attempt about to be retried.
 */
export function computeBackoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number
): number {
  const capped = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(random() * capped);
}

export interface RetryInfo {
  /** 1-based number of the retry about to happen. */
  attempt: number;
  /** Backoff already waited before this retry, in ms. */
  delayMs: number;
  /** The error that triggered the retry. */
  error: unknown;
}

export interface RetryOptions {
  /** Max retries *after* the first attempt. `0` disables retrying. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Override the transient/permanent classifier. */
  shouldRetry?: (error: unknown) => boolean;
  /** Cancels the loop between attempts; a pending backoff rejects with
   *  {@link RetryAbortError}. */
  signal?: AbortSignal;
  /** Injectable clock (tests). Must reject with {@link RetryAbortError} if
   *  `signal` aborts mid-wait. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Injectable RNG in `[0, 1)` (tests). Defaults to `Math.random`. */
  random?: () => number;
  /** Observability hook, fired once per retry before the operation re-runs. */
  onRetry?: (info: RetryInfo) => void;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RetryAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run `fn`, retrying transient failures with exponential backoff.
 *
 * The final failure is rethrown unchanged (its original type is preserved so
 * callers keep their `instanceof` branches). A permanent failure is rethrown on
 * the first attempt with no delay.
 *
 * @throws {RetryAbortError} if `signal` aborts during a backoff wait.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    shouldRetry = isRetryableSyncError,
    signal,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
  } = opts;

  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new RetryAbortError();
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= retries || !shouldRetry(e)) throw e;
      const delayMs = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs, random);
      onRetry?.({ attempt: attempt + 1, delayMs, error: e });
      await sleep(delayMs, signal);
    }
  }
}
