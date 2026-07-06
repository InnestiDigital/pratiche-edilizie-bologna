import { describe, it, expect } from 'vitest';
import { buildMatchSummary } from './settings-match-summary';

describe('buildMatchSummary', () => {
  it('reports a loading placeholder while either count is null', () => {
    expect(buildMatchSummary(null, null).number).toBe('—');
    expect(buildMatchSummary(null, 10).number).toBe('—');
    expect(buildMatchSummary(5, null).number).toBe('—');
    expect(buildMatchSummary(null, null).label).toBe('conteggio in corso…');
  });

  it('steers to the Aggiorna tab when the database is empty', () => {
    const s = buildMatchSummary(0, 0);
    expect(s.number).toBe('0');
    expect(s.caption).toMatch(/Aggiorna/);
  });

  it('distinguishes "no data" from "filters hid everything"', () => {
    const empty = buildMatchSummary(0, 0);
    const filteredOut = buildMatchSummary(0, 42);
    expect(empty.caption).not.toBe(filteredOut.caption);
    expect(filteredOut.caption).toMatch(/filtri/);
  });

  it('agrees the noun with the match count', () => {
    expect(buildMatchSummary(1, 10).label).toBe('voce corrisponde ai filtri');
    expect(buildMatchSummary(2, 10).label).toBe('voci corrispondono ai filtri');
    expect(buildMatchSummary(0, 10).label).toBe('voci corrispondono ai filtri');
  });

  it('says all are visible when the filters do not narrow anything', () => {
    expect(buildMatchSummary(10, 10).caption).toMatch(/Tutte/);
    // A count that meets-or-exceeds total is still treated as "all visible".
    expect(buildMatchSummary(11, 10).caption).toMatch(/Tutte/);
  });

  it('shows the "N su M totali" caption when filters narrow the set', () => {
    const s = buildMatchSummary(3, 10);
    expect(s.number).toBe('3');
    expect(s.caption).toBe('su 10 totali nel database');
  });
});
