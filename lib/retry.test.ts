import { describe, expect, it, vi } from 'vitest';
import {
  computeBackoffDelay,
  isRetryableSyncError,
  RetryAbortError,
  withRetry,
  type RetryInfo,
} from './retry';
import { SyncFetchError, SyncTimeoutError } from './fetch-page';
import { SyncIngressError } from './schemas';

/** A sleep stub that resolves instantly and records the delays it was asked to
 *  wait, so backoff timing can be asserted without a real clock. */
function recordingSleep() {
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms);
  });
  return { sleep, delays };
}

describe('isRetryableSyncError', () => {
  it('retries a timeout', () => {
    expect(isRetryableSyncError(new SyncTimeoutError('slow'))).toBe(true);
  });

  it('retries a network-level failure (no status)', () => {
    expect(isRetryableSyncError(new SyncFetchError('net', undefined))).toBe(true);
  });

  it('retries a 429 rate-limit and 5xx server errors', () => {
    expect(isRetryableSyncError(new SyncFetchError('rate', 429))).toBe(true);
    expect(isRetryableSyncError(new SyncFetchError('boom', 500))).toBe(true);
    expect(isRetryableSyncError(new SyncFetchError('boom', 503))).toBe(true);
    expect(isRetryableSyncError(new SyncFetchError('boom', 599))).toBe(true);
  });

  it('does NOT retry a 404/410 (endpoint gone) or other 4xx', () => {
    expect(isRetryableSyncError(new SyncFetchError('gone', 404))).toBe(false);
    expect(isRetryableSyncError(new SyncFetchError('gone', 410))).toBe(false);
    expect(isRetryableSyncError(new SyncFetchError('bad', 400))).toBe(false);
  });

  it('does NOT retry a schema-shape mismatch', () => {
    expect(isRetryableSyncError(new SyncIngressError('shape', []))).toBe(false);
  });

  it('does NOT retry a caller abort or an unknown error', () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    expect(isRetryableSyncError(abort)).toBe(false);
    expect(isRetryableSyncError(new RetryAbortError())).toBe(false);
    expect(isRetryableSyncError(new Error('nope'))).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  it('grows exponentially from the base before the cap', () => {
    // random() === 1 would exceed [0,1); use the upper bound to read the ceiling.
    expect(computeBackoffDelay(0, 500, 8000, () => 0.999999)).toBeLessThanOrEqual(500);
    expect(computeBackoffDelay(1, 500, 8000, () => 0.999999)).toBeLessThanOrEqual(1000);
    expect(computeBackoffDelay(2, 500, 8000, () => 0.999999)).toBeLessThanOrEqual(2000);
  });

  it('caps at maxMs', () => {
    // base*2^5 = 16000 > 8000 → capped
    expect(computeBackoffDelay(5, 500, 8000, () => 0.999999)).toBeLessThanOrEqual(8000);
  });

  it('applies full jitter: random()===0 yields no wait', () => {
    expect(computeBackoffDelay(3, 500, 8000, () => 0)).toBe(0);
  });

  it('scales the ceiling by the RNG value', () => {
    // attempt 1 ceiling = 1000; random 0.5 → 500
    expect(computeBackoffDelay(1, 500, 8000, () => 0.5)).toBe(500);
  });
});

describe('withRetry', () => {
  it('returns immediately on success without sleeping', async () => {
    const { sleep, delays } = recordingSleep();
    const fn = vi.fn(async () => 'ok');
    const out = await withRetry(fn, { sleep });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries a transient failure then succeeds', async () => {
    const { sleep, delays } = recordingSleep();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new SyncFetchError('flaky', 503);
      return 'recovered';
    });
    const out = await withRetry(fn, { sleep, random: () => 0.5 });
    expect(out).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
    // two backoffs: attempt 0 ceiling 500 → 250, attempt 1 ceiling 1000 → 500
    expect(delays).toEqual([250, 500]);
  });

  it('exhausts retries then rethrows the original error unchanged', async () => {
    const { sleep, delays } = recordingSleep();
    const err = new SyncFetchError('always down', 500);
    const fn = vi.fn(async () => {
      throw err;
    });
    const caught = await withRetry(fn, { retries: 2, sleep }).catch((e) => e);
    expect(caught).toBe(err);
    expect(caught).toBeInstanceOf(SyncFetchError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(delays).toHaveLength(2);
  });

  it('fails fast on a permanent error (no retry, no sleep)', async () => {
    const { sleep, delays } = recordingSleep();
    const fn = vi.fn(async () => {
      throw new SyncFetchError('gone', 404);
    });
    await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('fires onRetry once per retry with 1-based attempt, delay and error', async () => {
    const { sleep } = recordingSleep();
    const infos: RetryInfo[] = [];
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new SyncTimeoutError('slow');
      return 'ok';
    });
    await withRetry(fn, { sleep, random: () => 0, onRetry: (i) => infos.push(i) });
    expect(infos.map((i) => i.attempt)).toEqual([1, 2]);
    expect(infos.every((i) => i.error instanceof SyncTimeoutError)).toBe(true);
    expect(infos.every((i) => i.delayMs === 0)).toBe(true);
  });

  it('honours a custom shouldRetry predicate', async () => {
    const { sleep, delays } = recordingSleep();
    const fn = vi.fn(async () => {
      throw new Error('custom-transient');
    });
    const caught = await withRetry(fn, {
      retries: 1,
      sleep,
      shouldRetry: (e) => e instanceof Error && e.message === 'custom-transient',
    }).catch((e) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(2); // retried once despite not being a sync error
    expect(delays).toHaveLength(1);
  });

  it('throws RetryAbortError without calling fn when the signal is already aborted', async () => {
    const { sleep } = recordingSleep();
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => 'ok');
    await expect(withRetry(fn, { sleep, signal: controller.signal })).rejects.toBeInstanceOf(
      RetryAbortError
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('the default sleep rejects with RetryAbortError when aborted mid-backoff', async () => {
    const controller = new AbortController();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      throw new SyncFetchError('down', 500);
    });
    // No injected sleep → real timer-based backoff; abort during the wait.
    const promise = withRetry(fn, {
      baseDelayMs: 10_000,
      signal: controller.signal,
      random: () => 0.999999,
    }).catch((e) => e);
    // Let the first attempt fail and enter backoff, then abort.
    await Promise.resolve();
    controller.abort();
    const caught = await promise;
    expect(caught).toBeInstanceOf(RetryAbortError);
    expect(calls).toBe(1);
  });
});
