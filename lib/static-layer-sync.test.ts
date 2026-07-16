import { describe, it, expect } from 'vitest';
import { fetchStaticLayer } from './static-layer-sync';
import type { fetchPage } from './fetch-page';
import type { ParsedPage } from './schemas';
import type { StaticMarker } from './static-layers';

/**
 * The static-layer fetch is a thin device-network seam (every parse DECISION lives
 * in the vitest-gated `source-*.ts` parsers). The ONE decision that lives here is
 * the `selectFields` → ODS `select` threading: a layer whose dataset carries no
 * natural per-row id (mercati) must select the meta `recordid` to key its markers,
 * while farmacie/scuole keep their full-payload query. This test injects a
 * capturing transport to assert exactly that — the only behaviour worth pinning in
 * the otherwise-untested glue.
 */
function capturingFetchPage(): {
  fetchPage: typeof fetchPage;
  calls: Record<string, string>[];
} {
  const calls: Record<string, string>[] = [];
  const impl = (async (_url: string, params: Record<string, string>) => {
    calls.push(params);
    // A single empty page: walkPages stops when a page returns fewer rows than the
    // limit, so one call with no results ends the walk immediately.
    return { results: [], totalCount: 0, skipped: 0 } satisfies ParsedPage<StaticMarker>;
  }) as unknown as typeof fetchPage;
  return { fetchPage: impl, calls };
}

describe('fetchStaticLayer — select threading', () => {
  it('adds an ODS select of recordid + parser fields for a selectFields layer (mercati)', async () => {
    const { fetchPage: impl, calls } = capturingFetchPage();
    await fetchStaticLayer('mercati', { fetchPage: impl });
    expect(calls).toHaveLength(1);
    expect(calls[0].select).toBe('recordid,denominazione,giorni_svolgimento,ubicazione,geopoint');
  });

  it('omits select for a layer with a natural id (farmacie / scuole keep full payload)', async () => {
    for (const layer of ['farmacie', 'scuole'] as const) {
      const { fetchPage: impl, calls } = capturingFetchPage();
      await fetchStaticLayer(layer, { fetchPage: impl });
      expect(calls).toHaveLength(1);
      expect(calls[0]).not.toHaveProperty('select');
    }
  });
});
