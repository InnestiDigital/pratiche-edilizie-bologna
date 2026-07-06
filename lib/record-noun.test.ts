import { describe, it, expect } from 'vitest';
import { RECORD_NOUN, recordNoun } from './record-noun';

describe('recordNoun', () => {
  it('uses the singular for exactly one', () => {
    expect(recordNoun(1)).toBe('voce');
  });

  it('uses the plural for anything that is not one', () => {
    expect(recordNoun(0)).toBe('voci');
    expect(recordNoun(2)).toBe('voci');
    expect(recordNoun(42)).toBe('voci');
  });

  it('treats non-one edge values (negative / fractional) as plural', () => {
    // The screens sanitize counts before display; the helper only owns agreement,
    // so any count other than exactly 1 takes the plural.
    expect(recordNoun(-1)).toBe('voci');
    expect(recordNoun(1.5)).toBe('voci');
  });

  it('exposes a feminine noun so downstream agreements are unchanged from "pratica"', () => {
    // "voce" is feminine like the old "pratica" — this is load-bearing for the
    // nuova/nuove · letta/lette · salvata · corrisponde/corrispondono agreements
    // in the screens that consume it.
    expect(RECORD_NOUN.singular).toBe('voce');
    expect(RECORD_NOUN.plural).toBe('voci');
  });
});
