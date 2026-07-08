import { describe, it, expect } from 'vitest';
import {
  makeSourceId,
  normalizeStatus,
  extractTags,
  deriveZone,
  makeSourceLink,
  normalizeRecord,
  type RawRecord,
} from './normalize';

function rawRecord(overrides: Partial<RawRecord> = {}): RawRecord {
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

describe('makeSourceId', () => {
  it('joins dataset key, year and protocol number', () => {
    expect(makeSourceId('pdc', rawRecord())).toBe('pdc-2025-12345');
  });

  it('keeps year/protocol from the record, not derived', () => {
    const r = rawRecord({ richiesta_anno_prot: '1999', richiesta_ndeg_prot: 7 });
    expect(makeSourceId('scia', r)).toBe('scia-1999-7');
  });
});

describe('normalizeStatus', () => {
  it("returns 'altro' for null/empty input", () => {
    expect(normalizeStatus(null)).toBe('altro');
    expect(normalizeStatus('')).toBe('altro');
  });

  it("returns 'altro' for an unrecognised status", () => {
    expect(normalizeStatus('qualcosa di ignoto')).toBe('altro');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeStatus('  RILASCIATA  ')).toBe('rilasciata');
  });

  it("prefers the more specific 'con prescrizioni' before plain rilasciata", () => {
    expect(normalizeStatus('Rilasciata con prescrizioni')).toBe('rilasciata_con_prescrizioni');
    // 'condizionata' is also an alias for the prescrizioni status
    expect(normalizeStatus('Pratica condizionata')).toBe('rilasciata_con_prescrizioni');
  });

  it('maps common aliases to their canonical status', () => {
    expect(normalizeStatus('esito positivo')).toBe('rilasciata');
    expect(normalizeStatus('Diniegata')).toBe('diniegata');
    expect(normalizeStatus('esito negativo')).toBe('diniegata');
    expect(normalizeStatus("Archiviazione d'ufficio")).toBe('archiviata');
    expect(normalizeStatus('In attesa di integrazioni')).toBe('in_attesa');
  });
});

describe('extractTags', () => {
  it('returns an empty array for null procedimento', () => {
    expect(extractTags(null)).toEqual([]);
  });

  it('matches tag rules case-insensitively', () => {
    expect(extractTags('intervento non residenziale con lavori')).toEqual(
      expect.arrayContaining(['non_residenziale', 'con_lavori'])
    );
  });

  it("adds 'urbanistica' for a 'URB ' prefix even without the full word", () => {
    expect(extractTags('URB pratica generica')).toContain('urbanistica');
  });

  it("does not duplicate 'urbanistica' when both rule and prefix match", () => {
    const tags = extractTags('URBANISTICA generale');
    expect(tags.filter((t) => t === 'urbanistica')).toHaveLength(1);
  });

  it('returns no tags when nothing matches', () => {
    expect(extractTags('pratica ordinaria')).toEqual([]);
  });
});

describe('deriveZone', () => {
  it('returns null for a null codvia', () => {
    expect(deriveZone(null)).toBeNull();
  });

  it('maps a known codvia to its quartiere', () => {
    expect(deriveZone(350)).toBe('Santo Stefano');
  });

  it('returns null for an unmapped codvia', () => {
    expect(deriveZone(-1)).toBeNull();
  });
});

describe('makeSourceLink', () => {
  it('builds the Bologna portal URL with slug, year and protocol', () => {
    const link = makeSourceLink('pdc', '2025', 12345);
    expect(link).toContain('permessi-di-costruire-rilasciati');
    expect(link).toContain('2025');
    expect(link).toContain('12345');
    expect(link.startsWith('https://opendata.comune.bologna.it')).toBe(true);
  });
});

describe('normalizeRecord', () => {
  it('maps a full raw record into the normalized permit shape', () => {
    const out = normalizeRecord('pdc', rawRecord());
    expect(out).toMatchObject({
      dataset: 'pdc',
      source_id: 'pdc-2025-12345',
      filing_type: 'PDC',
      source_updated_at: '2025-03-01',
      address: 'Via Indipendenza 10',
      zone: 'Santo Stefano',
      codvia: 350,
      procedimento: 'PDC ORDINARIO',
      date_issued: '2025-06-01',
      status: 'rilasciata',
      status_raw: 'Rilasciata',
    });
    expect(JSON.parse(out.tags)).toEqual([]);
  });

  it("stamps every dataset's records with the 'edilizia' category", () => {
    expect(normalizeRecord('pdc', rawRecord()).category).toBe('edilizia');
    expect(normalizeRecord('scia', rawRecord()).category).toBe('edilizia');
    expect(normalizeRecord('cila', rawRecord()).category).toBe('edilizia');
  });

  it('coerces null esito/procedimento to safe defaults', () => {
    const out = normalizeRecord('cila', rawRecord({ esito_pratica: null, procedimento: null }));
    expect(out.status).toBe('altro');
    expect(out.status_raw).toBe('');
    expect(out.procedimento).toBe('');
    expect(out.tags).toBe('[]');
  });

  it('serialises extracted tags as a JSON string', () => {
    const out = normalizeRecord('scia', rawRecord({ procedimento: 'SCIA NON RESIDENZIALE' }));
    expect(JSON.parse(out.tags)).toContain('non_residenziale');
  });

  it('persists the civic number into extra (the gazetteer geocode key)', () => {
    const out = normalizeRecord('pdc', rawRecord({ civico: 24 }));
    expect(JSON.parse(out.extra)).toEqual({ civico: '24' });
  });

  it('leaves extra empty for a civic-less edilizia row (byte-identical to before)', () => {
    const out = normalizeRecord('pdc', rawRecord({ civico: null }));
    expect(out.extra).toBe('{}');
  });
});
