import { describe, it, expect } from 'vitest';
import { buildShareMessage, type ShareMessageInput } from './share-message';

const full: ShareMessageInput = {
  filingLabel: 'Permesso di Costruire',
  address: 'Via Marconi 24',
  zone: 'Porto-Saragozza',
  procedimento: 'Ristrutturazione edilizia con cambio di destinazione d’uso',
  statusLabel: 'Rilasciata',
  referenceLabel: 'Protocollo',
  protocol: '000481/2024',
  requestDate: '2024-11-18',
  sourceLink: 'https://opendata.comune.bologna.it/pdc/2024/481',
};

describe('buildShareMessage', () => {
  it('builds the full multi-line message in the fixed order', () => {
    expect(buildShareMessage(full)).toBe(
      [
        'Permesso di Costruire — Via Marconi 24',
        'Porto-Saragozza',
        'Ristrutturazione edilizia con cambio di destinazione d’uso',
        'Stato: Rilasciata',
        'Protocollo: 000481/2024',
        'Richiesta: 18/11/2024',
        'https://opendata.comune.bologna.it/pdc/2024/481',
      ].join('\n')
    );
  });

  it('always emits the title line with the required status + protocol lines', () => {
    const bare = buildShareMessage({
      filingLabel: 'SCIA',
      address: null,
      zone: null,
      procedimento: null,
      statusLabel: 'In attesa',
      referenceLabel: 'Protocollo',
      protocol: '2210/2023',
      requestDate: null,
      sourceLink: null,
    });
    expect(bare).toBe(
      ['SCIA — Indirizzo non disponibile', 'Stato: In attesa', 'Protocollo: 2210/2023'].join('\n')
    );
  });

  it('falls back to a label when the address is blank', () => {
    const msg = buildShareMessage({ ...full, address: '   ' });
    expect(msg.split('\n')[0]).toBe('Permesso di Costruire — Indirizzo non disponibile');
  });

  it('drops blank/whitespace-only optional lines rather than emitting empty lines', () => {
    const msg = buildShareMessage({
      ...full,
      zone: '  ',
      procedimento: '',
      sourceLink: '   ',
    });
    expect(msg).toBe(
      [
        'Permesso di Costruire — Via Marconi 24',
        'Stato: Rilasciata',
        'Protocollo: 000481/2024',
        'Richiesta: 18/11/2024',
      ].join('\n')
    );
    expect(msg).not.toContain('\n\n');
  });

  it('formats the request date TZ-safely as dd/mm/yyyy from an ISO datetime', () => {
    const msg = buildShareMessage({ ...full, requestDate: '2024-01-05T23:30:00Z' });
    expect(msg).toContain('Richiesta: 05/01/2024');
  });

  it('omits the request line for a null or unparseable-but-blank date', () => {
    expect(buildShareMessage({ ...full, requestDate: null })).not.toContain('Richiesta:');
    expect(buildShareMessage({ ...full, requestDate: '   ' })).not.toContain('Richiesta:');
  });

  it('keeps an unparseable non-empty date verbatim (never a crash or Invalid Date)', () => {
    const msg = buildShareMessage({ ...full, requestDate: 'boh' });
    expect(msg).toContain('Richiesta: boh');
  });

  it('uses the category-aware reference label instead of hardcoding "Protocollo"', () => {
    // An evento's source_id is a record id, not a protocollo — sharing it must
    // read "Riferimento: …", not the edilizia-only "Protocollo:" copy bleed.
    const msg = buildShareMessage({
      ...full,
      filingLabel: 'Evento',
      referenceLabel: 'Riferimento',
      protocol: '467834',
    });
    expect(msg).toContain('Riferimento: 467834');
    expect(msg).not.toContain('Protocollo');
  });

  it('drops the reference line entirely when the id is blank', () => {
    const msg = buildShareMessage({ ...full, protocol: '   ' });
    expect(msg).not.toContain('Protocollo');
    expect(msg).not.toContain('Riferimento');
    expect(msg).not.toContain('\n\n');
  });

  it('trims surrounding whitespace on the optional lines it keeps', () => {
    const msg = buildShareMessage({ ...full, zone: '  Savena  ' });
    expect(msg).toContain('\nSavena\n');
  });
});
