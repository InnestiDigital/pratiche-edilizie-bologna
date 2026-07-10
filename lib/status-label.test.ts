import { describe, expect, it } from 'vitest';
import { statusLabelFor } from './status-label';

describe('statusLabelFor', () => {
  it('renders concluso feminine for edilizia (una pratica → Conclusa)', () => {
    expect(statusLabelFor('concluso', 'edilizia', 'Conclusa')).toBe('Conclusa');
  });

  it('renders concluso feminine for commercio (una pratica → Conclusa)', () => {
    expect(statusLabelFor('concluso', 'commercio', 'Concluso')).toBe('Conclusa');
  });

  it('keeps concluso masculine for cantieri (un cantiere → Concluso)', () => {
    expect(statusLabelFor('concluso', 'cantieri', 'Concluso')).toBe('Concluso');
  });

  it('uses the shared STATUS_LABELS for a non-overridden edilizia status', () => {
    expect(statusLabelFor('rilasciata', 'edilizia', 'Rilasciata')).toBe('Rilasciata');
    expect(statusLabelFor('diniegata', 'edilizia', 'Diniegata')).toBe('Diniegata');
  });

  it('falls back to the raw source string for an unknown status', () => {
    expect(statusLabelFor('boh', 'edilizia', 'Stato Ignoto')).toBe('Stato Ignoto');
  });

  it('does not override a status the category has no special-casing for', () => {
    expect(statusLabelFor('in_programma', 'eventi', 'In programma')).toBe('In programma');
  });

  it('renders segnalazioni altro as "Ricevuta" (a report in the open data is received)', () => {
    expect(statusLabelFor('altro', 'segnalazioni', 'Altro')).toBe('Ricevuta');
  });

  it('keeps altro as "Altro" for edilizia (a genuine unknown-status catch-all)', () => {
    expect(statusLabelFor('altro', 'edilizia', 'Altro')).toBe('Altro');
  });
});
