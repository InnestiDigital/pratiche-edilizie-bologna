import { describe, it, expect } from 'vitest';
import { FILING_TYPE_ORDER, FILING_TYPE_FULL_NAMES, FILING_TYPE_DESCRIPTIONS } from './constants';

// The filing-type explainer on the permit detail screen renders the full name +
// a description for the permit's filing_type. The Record<FilingType, string> type
// already forces every key to exist at compile time; these runtime checks guard
// the *copy* — that no entry is blank, and that the three procedures read
// distinctly so the explainer never shows placeholder or duplicated text.
describe('filing-type explainer copy', () => {
  it('has a non-empty full name for every filing type', () => {
    for (const type of FILING_TYPE_ORDER) {
      expect(FILING_TYPE_FULL_NAMES[type].trim().length).toBeGreaterThan(0);
    }
  });

  it('has a non-empty description for every filing type', () => {
    for (const type of FILING_TYPE_ORDER) {
      expect(FILING_TYPE_DESCRIPTIONS[type].trim().length).toBeGreaterThan(0);
    }
  });

  it('gives each filing type a distinct full name and description', () => {
    const names = FILING_TYPE_ORDER.map((t) => FILING_TYPE_FULL_NAMES[t]);
    const descriptions = FILING_TYPE_ORDER.map((t) => FILING_TYPE_DESCRIPTIONS[t]);
    expect(new Set(names).size).toBe(FILING_TYPE_ORDER.length);
    expect(new Set(descriptions).size).toBe(FILING_TYPE_ORDER.length);
  });

  it('spells out the acronyms in the full names', () => {
    // The whole point of the full-name map is that SCIA / CILA are no longer bare
    // acronyms — assert the expansion actually happened.
    expect(FILING_TYPE_FULL_NAMES.SCIA).toContain('Segnalazione Certificata');
    expect(FILING_TYPE_FULL_NAMES.CILA).toContain('Comunicazione Inizio Lavori');
  });
});
