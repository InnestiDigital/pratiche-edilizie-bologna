import { describe, it, expect } from 'vitest';
import { parseApiResponse, rawRecordSchema, SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    richiesta_ndeg_prot: 12345,
    richiesta_anno_prot: '2025',
    richiesta_data: '2025-03-01',
    procedimento: 'PDC ORDINARIO',
    esito_pratica: 'Rilasciata',
    chiusura_pratica_data: '2025-06-01',
    codvia: 350,
    civico: 10,
    esponenteciv: null,
    localizzazioni_lista: 'Via Indipendenza 10',
    ...overrides,
  };
}

describe('parseApiResponse — envelope', () => {
  it('parses a well-formed page', () => {
    const page = parseApiResponse({ total_count: 1, results: [rawRow()] });
    expect(page.totalCount).toBe(1);
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(0);
    expect(page.results[0].richiesta_ndeg_prot).toBe(12345);
  });

  it('defaults total_count to 0 when absent', () => {
    const page = parseApiResponse({ results: [] });
    expect(page.totalCount).toBe(0);
  });

  it('defaults results to [] when absent', () => {
    const page = parseApiResponse({ total_count: 5 });
    expect(page.results).toEqual([]);
    expect(page.totalCount).toBe(5);
  });

  it('coerces a null total_count to 0', () => {
    const page = parseApiResponse({ total_count: null, results: [] });
    expect(page.totalCount).toBe(0);
  });
});

describe('parseApiResponse — shape drift throws SyncIngressError', () => {
  it('throws when the payload is not an object', () => {
    expect(() => parseApiResponse('<html>error</html>')).toThrow(SyncIngressError);
  });

  it('throws when the payload is null', () => {
    expect(() => parseApiResponse(null)).toThrow(SyncIngressError);
  });

  it('throws when results is not an array', () => {
    expect(() => parseApiResponse({ total_count: 1, results: { not: 'an array' } })).toThrow(
      SyncIngressError
    );
  });

  it('carries a typed name and issue detail', () => {
    try {
      parseApiResponse({ results: 42 });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SyncIngressError);
      expect((e as SyncIngressError).name).toBe('SyncIngressError');
      expect((e as SyncIngressError).message).toContain('non valida');
      expect((e as SyncIngressError).issues).toBeDefined();
    }
  });
});

describe('parseApiResponse — per-row resilience', () => {
  it('skips a malformed row instead of aborting the page', () => {
    const page = parseApiResponse({
      total_count: 2,
      results: [rawRow(), { richiesta_anno_prot: '2025' /* no prot number */ }],
    });
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(1);
  });

  it('skips a row whose required id field has the wrong type', () => {
    const page = parseApiResponse({
      results: [rawRow({ richiesta_ndeg_prot: 'not-a-number' })],
    });
    expect(page.results).toHaveLength(0);
    expect(page.skipped).toBe(1);
  });
});

describe('rawRecordSchema — field handling', () => {
  it('accepts a numeric year and coerces it to a string', () => {
    const parsed = rawRecordSchema.parse(rawRow({ richiesta_anno_prot: 2025 }));
    expect(parsed.richiesta_anno_prot).toBe('2025');
    expect(typeof parsed.richiesta_anno_prot).toBe('string');
  });

  it('normalizes absent nullable fields to null', () => {
    const parsed = rawRecordSchema.parse({
      richiesta_ndeg_prot: 1,
      richiesta_anno_prot: '2025',
    });
    expect(parsed.richiesta_data).toBeNull();
    expect(parsed.codvia).toBeNull();
    expect(parsed.localizzazioni_lista).toBeNull();
  });

  it('preserves unknown passthrough fields', () => {
    const parsed = rawRecordSchema.parse(rawRow({ campo_sconosciuto: 'tienilo' })) as Record<
      string,
      unknown
    >;
    expect(parsed.campo_sconosciuto).toBe('tienilo');
  });

  it('rejects a row missing the protocol number', () => {
    const r = rawRecordSchema.safeParse({ richiesta_anno_prot: '2025' });
    expect(r.success).toBe(false);
  });
});
