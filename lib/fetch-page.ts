import { parseApiResponse, type ParsedPage } from './schemas';
import type { RawRecord } from './normalize';

/**
 * Sync transport layer.
 *
 * A single well-behaved fetch against the Bologna open-data (ODS v2.1) records
 * endpoint. This module owns transport concerns only — timeout, cancellation,
 * HTTP status, and content-type/body validation — and hands the raw JSON to a
 * caller-supplied ingress parser (`opts.parse`) for shape validation, defaulting
 * to the edilizia {@link parseApiResponse}. It deliberately knows nothing about
 * SQLite, datasets, or paging — and, via the injected parser, nothing about which
 * source's schema it is validating — so it can be unit-tested without any
 * Expo/native dependency.
 */

/** Default per-request timeout. The endpoint is normally fast; a hung socket
 *  must not stall a background sync indefinitely. */
export const FETCH_TIMEOUT_MS = 20_000;

/**
 * Thrown for a transport-level failure: non-2xx status, an unexpected
 * content-type (e.g. a 200 HTML error page), or a body that is not valid JSON.
 */
export class SyncFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string
  ) {
    super(message);
    this.name = 'SyncFetchError';
  }
}

/** Thrown when a request exceeds its timeout budget. Caller-initiated
 *  cancellation propagates as the original `AbortError` instead. */
export class SyncTimeoutError extends Error {
  constructor(
    message: string,
    readonly url?: string
  ) {
    super(message);
    this.name = 'SyncTimeoutError';
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Matches `application/json` and structured-suffix JSON types (`…+json`). */
const JSON_CONTENT_TYPE = /\bapplication\/json\b|\+json\b/i;

export interface FetchPageOptions<T = RawRecord> {
  /** Caller cancellation. Combined with the internal timeout — whichever fires
   *  first aborts the request. */
  signal?: AbortSignal;
  /** Override the default {@link FETCH_TIMEOUT_MS} (mainly for tests). */
  timeoutMs?: number;
  /**
   * The per-source ingress parser that validates the JSON body's shape and
   * yields a {@link ParsedPage}. Defaults to the edilizia {@link parseApiResponse}
   * so existing edilizia callers/tests are unchanged; the other sources pass
   * their own parser (paired with a normalizer in `source-runtime.ts`).
   */
  parse?: (json: unknown) => ParsedPage<T>;
}

/**
 * Fetch and validate one page of open-data records.
 *
 * @throws {SyncTimeoutError} when the request exceeds `timeoutMs`.
 * @throws {SyncFetchError} on non-2xx status, an unexpected content-type, or an
 *   unparseable JSON body.
 * @throws {import('./schemas').SyncIngressError} when the JSON parses but its
 *   envelope shape is wrong (re-thrown from the ingress parser).
 *   A caller-supplied `signal` abort propagates as the original `AbortError`.
 */
export async function fetchPage<T = RawRecord>(
  url: string,
  params: Record<string, string>,
  opts: FetchPageOptions<T> = {}
): Promise<ParsedPage<T>> {
  const { signal: callerSignal, timeoutMs = FETCH_TIMEOUT_MS } = opts;
  const qs = new URLSearchParams(params).toString();
  const fullUrl = `${url}?${qs}`;

  // One controller drives both the timeout and any caller cancellation, so the
  // timeout lives inside this function rather than relying on a caller signal.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(fullUrl, { signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      // Distinguish a timeout from a caller-requested cancellation.
      if (callerSignal?.aborted) throw e;
      throw new SyncTimeoutError(`Timeout dopo ${timeoutMs}ms: ${url}`, url);
    }
    throw new SyncFetchError(`Errore di rete: ${messageOf(e)}`, undefined, url);
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }

  if (!resp.ok) {
    throw new SyncFetchError(`Errore API: ${resp.status}`, resp.status, url);
  }

  // Validate the response beyond `.ok`: a 200 with an HTML error page (endpoint
  // moved, WAF challenge, maintenance) must not reach the JSON parser blindly.
  const contentType = resp.headers.get('content-type') ?? '';
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    const snippet = (await resp.text()).slice(0, 200);
    throw new SyncFetchError(
      `Content-Type inatteso "${contentType || '(nessuno)'}" da ${url}: ${snippet}`,
      resp.status,
      url
    );
  }

  let data: unknown;
  try {
    data = await resp.json();
  } catch (e) {
    throw new SyncFetchError(`Corpo JSON non valido da ${url}: ${messageOf(e)}`, resp.status, url);
  }

  if (opts.parse) return opts.parse(data);
  // Back-compat default: the edilizia parser. Reachable only when no per-source
  // parser is supplied, i.e. `T` is its `RawRecord` default — a single documented
  // assertion at the generic-default boundary (parseApiResponse is ParsedPage<RawRecord>).
  return parseApiResponse(data) as unknown as ParsedPage<T>;
}
