import { describe, it, expect } from 'vitest';
import { parseCivicoInput, streetDisplayName, formatHomeAddressLabel } from './home-address';

describe('home-address — parseCivicoInput', () => {
  it('parses a positive integer', () => {
    expect(parseCivicoInput('12')).toBe(12);
    expect(parseCivicoInput('  7 ')).toBe(7);
    expect(parseCivicoInput('210')).toBe(210);
  });

  it('tolerates a civic suffix by taking the leading digits', () => {
    expect(parseCivicoInput('12a')).toBe(12);
    expect(parseCivicoInput('24/A')).toBe(24);
  });

  it('returns null for empty / non-numeric / non-positive input (street-level)', () => {
    expect(parseCivicoInput('')).toBeNull();
    expect(parseCivicoInput('   ')).toBeNull();
    expect(parseCivicoInput('abc')).toBeNull();
    expect(parseCivicoInput('0')).toBeNull();
    expect(parseCivicoInput('-3')).toBeNull();
  });
});

describe('home-address — streetDisplayName', () => {
  it('strips a trailing house number for a clean picker name', () => {
    expect(streetDisplayName('Via Marconi 24')).toBe('Via Marconi');
    expect(streetDisplayName('Via Emilia Ponente 210')).toBe('Via Emilia Ponente');
    expect(streetDisplayName('Piazza Maggiore 6')).toBe('Piazza Maggiore');
    expect(streetDisplayName('Via Saragozza 118A')).toBe('Via Saragozza');
    expect(streetDisplayName('Via Marconi, 12')).toBe('Via Marconi');
    expect(streetDisplayName('Via Andrea Costa 140/2')).toBe('Via Andrea Costa');
  });

  it('leaves a name whose trailing token is not a house number', () => {
    expect(streetDisplayName('Via del 2 Agosto')).toBe('Via del 2 Agosto');
    expect(streetDisplayName('Via Marconi')).toBe('Via Marconi');
  });

  it('keeps the trimmed original when stripping would empty it', () => {
    expect(streetDisplayName('  24  ')).toBe('24');
  });
});

describe('home-address — formatHomeAddressLabel', () => {
  it('appends the civic number when present', () => {
    expect(formatHomeAddressLabel('Via Marconi', 12)).toBe('Via Marconi 12');
  });

  it('shows the bare street at street level (no civic)', () => {
    expect(formatHomeAddressLabel('Via Marconi', null)).toBe('Via Marconi');
    expect(formatHomeAddressLabel('  Via Marconi  ', null)).toBe('Via Marconi');
  });
});
