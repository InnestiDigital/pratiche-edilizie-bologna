import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPage, SyncFetchError, SyncTimeoutError } from './fetch-page';
import { SyncIngressError } from './schemas';

const URL = 'https://opendata.example/records';

/** Build a minimal Response-like object for the fetch mock. */
function jsonResponse(
  body: unknown,
  { ok = true, status = 200, contentType = 'application/json; charset=utf-8' } = {}
): Response {
  return {
    ok,
    status,
    headers: new Headers(contentType ? { 'content-type': contentType } : {}),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const validPayload = {
  total_count: 2,
  results: [
    { richiesta_ndeg_prot: 1, richiesta_anno_prot: '2025' },
    { richiesta_ndeg_prot: 2, richiesta_anno_prot: '2025' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchPage — happy path', () => {
  it('parses a valid JSON envelope into a ParsedPage', async () => {
    stubFetch(async () => jsonResponse(validPayload));
    const page = await fetchPage(URL, { limit: '100', offset: '0' });
    expect(page.totalCount).toBe(2);
    expect(page.results).toHaveLength(2);
    expect(page.skipped).toBe(0);
  });

  it('builds the query string from params', async () => {
    const fn = stubFetch(async () => jsonResponse(validPayload));
    await fetchPage(URL, { limit: '100', offset: '200', refine: 'anno:2025' });
    const called = fn.mock.calls[0][0] as string;
    expect(called).toBe(`${URL}?limit=100&offset=200&refine=anno%3A2025`);
  });

  it('accepts a structured-suffix JSON content-type (+json)', async () => {
    stubFetch(async () => jsonResponse(validPayload, { contentType: 'application/geo+json' }));
    const page = await fetchPage(URL, {});
    expect(page.results).toHaveLength(2);
  });
});

describe('fetchPage — response validation', () => {
  it('throws SyncFetchError with status on a non-2xx response', async () => {
    stubFetch(async () => jsonResponse({}, { ok: false, status: 503 }));
    await expect(fetchPage(URL, {})).rejects.toMatchObject({
      name: 'SyncFetchError',
      status: 503,
    });
  });

  it('rejects a 200 with a non-JSON content-type (HTML error page)', async () => {
    stubFetch(async () =>
      jsonResponse('<html><body>Service Unavailable</body></html>', {
        contentType: 'text/html',
      })
    );
    const err = await fetchPage(URL, {}).catch((e) => e);
    expect(err).toBeInstanceOf(SyncFetchError);
    expect(err.message).toContain('Content-Type inatteso');
    expect(err.message).toContain('Service Unavailable');
  });

  it('rejects when the content-type header is absent', async () => {
    stubFetch(async () => jsonResponse('nope', { contentType: '' }));
    await expect(fetchPage(URL, {})).rejects.toBeInstanceOf(SyncFetchError);
  });

  it('throws SyncFetchError when the body is not valid JSON', async () => {
    const resp = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => '<html>',
    } as unknown as Response;
    stubFetch(async () => resp);
    await expect(fetchPage(URL, {})).rejects.toMatchObject({ name: 'SyncFetchError' });
  });

  it('propagates SyncIngressError when the JSON envelope shape is wrong', async () => {
    stubFetch(async () => jsonResponse({ results: 'not-an-array' }));
    await expect(fetchPage(URL, {})).rejects.toBeInstanceOf(SyncIngressError);
  });

  it('wraps a network failure in SyncFetchError', async () => {
    stubFetch(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(fetchPage(URL, {})).rejects.toMatchObject({
      name: 'SyncFetchError',
      status: undefined,
    });
  });
});

describe('fetchPage — timeout & cancellation', () => {
  /** A fetch that never resolves until its signal aborts. */
  function hangingFetch() {
    return stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
  }

  it('throws SyncTimeoutError when the request exceeds timeoutMs', async () => {
    hangingFetch();
    await expect(fetchPage(URL, {}, { timeoutMs: 10 })).rejects.toBeInstanceOf(SyncTimeoutError);
  });

  it('propagates the AbortError when the caller cancels', async () => {
    hangingFetch();
    const controller = new AbortController();
    const promise = fetchPage(URL, {}, { signal: controller.signal, timeoutMs: 5_000 });
    controller.abort();
    const err = await promise.catch((e) => e);
    expect(err).not.toBeInstanceOf(SyncTimeoutError);
    expect(err.name).toBe('AbortError');
  });

  it('aborts immediately when handed an already-aborted signal', async () => {
    const fn = hangingFetch();
    const controller = new AbortController();
    controller.abort();
    const err = await fetchPage(URL, {}, { signal: controller.signal }).catch((e) => e);
    expect(err.name).toBe('AbortError');
    // fetch is still invoked, but with an already-aborted signal.
    expect((fn.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });
});
