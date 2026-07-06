import { describe, expect, it } from 'vitest';
import { sectionCountLabel } from './section-count-label';

describe('sectionCountLabel', () => {
  it('uses the singular noun for exactly one', () => {
    expect(sectionCountLabel(1)).toBe('1 voce');
  });

  it('uses the plural noun for more than one', () => {
    expect(sectionCountLabel(2)).toBe('2 voci');
    expect(sectionCountLabel(3)).toBe('3 voci');
    expect(sectionCountLabel(42)).toBe('42 voci');
  });

  it('renders zero as the plural form', () => {
    expect(sectionCountLabel(0)).toBe('0 voci');
  });

  it('floors a fractional count', () => {
    expect(sectionCountLabel(1.9)).toBe('1 voce');
    expect(sectionCountLabel(3.2)).toBe('3 voci');
  });

  it('clamps negatives to zero', () => {
    expect(sectionCountLabel(-5)).toBe('0 voci');
  });

  it('clamps NaN / Infinity to zero', () => {
    expect(sectionCountLabel(NaN)).toBe('0 voci');
    expect(sectionCountLabel(Infinity)).toBe('0 voci');
    expect(sectionCountLabel(-Infinity)).toBe('0 voci');
  });
});
