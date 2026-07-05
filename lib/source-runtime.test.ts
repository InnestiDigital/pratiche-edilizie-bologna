import { describe, it, expect } from 'vitest';
import { SOURCE_RUNTIME } from './source-runtime';
import { SOURCES, type SourceKey } from './sources';

/** A minimal valid row for each source's ingress schema. */
const SAMPLE_ROW: Record<SourceKey, Record<string, unknown>> = {
  pdc: { richiesta_ndeg_prot: 1, richiesta_anno_prot: '2025' },
  scia: { richiesta_ndeg_prot: 2, richiesta_anno_prot: '2025' },
  cila: { richiesta_ndeg_prot: 3, richiesta_anno_prot: '2025' },
  lavori: { id: 10 },
  commercio: { n_e_anno_prot_domanda: '416143 / 2018' },
  eventi: { id: '99', title: 'Concerto' },
  segnalazioni: { ticketid: 109780 },
};

describe('SOURCE_RUNTIME', () => {
  it('has a runtime for exactly every SOURCES key', () => {
    expect(Object.keys(SOURCE_RUNTIME).sort()).toEqual(Object.keys(SOURCES).sort());
  });

  it.each(Object.keys(SOURCES) as SourceKey[])(
    '%s normalizes a valid page, stamping its category / dataset / filing token',
    (key) => {
      const payload = { total_count: 1, results: [SAMPLE_ROW[key]] };
      const page = SOURCE_RUNTIME[key].parseAndNormalize(payload);

      expect(page.totalCount).toBe(1);
      expect(page.skipped).toBe(0);
      expect(page.results).toHaveLength(1);

      const permit = page.results[0];
      expect(permit.category).toBe(SOURCES[key].category);
      expect(permit.filing_type).toBe(SOURCES[key].filingTypeToken);
      // dataset is the source key for the new sources; edilizia stamps the key too.
      expect(permit.dataset).toBe(key);
      // Every normalized permit carries a stable, dataset-scoped source id.
      expect(permit.source_id.length).toBeGreaterThan(0);
    }
  );

  it('passes total_count through and counts skipped rows', () => {
    // Two rows, one valid one malformed (missing required id) → one skipped.
    const payload = { total_count: 42, results: [SAMPLE_ROW.lavori, { notAnId: true }] };
    const page = SOURCE_RUNTIME.lavori.parseAndNormalize(payload);
    expect(page.totalCount).toBe(42);
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(1);
  });
});
