import { describe, expect, it } from 'vitest';
import { sectionCountLabel } from './section-count-label';

describe('sectionCountLabel', () => {
  it('uses the singular noun for exactly one', () => {
    expect(sectionCountLabel(1)).toBe('1 pratica');
  });

  it('uses the plural noun for more than one', () => {
    expect(sectionCountLabel(2)).toBe('2 pratiche');
    expect(sectionCountLabel(3)).toBe('3 pratiche');
    expect(sectionCountLabel(42)).toBe('42 pratiche');
  });

  it('renders zero as the plural form', () => {
    expect(sectionCountLabel(0)).toBe('0 pratiche');
  });

  it('floors a fractional count', () => {
    expect(sectionCountLabel(1.9)).toBe('1 pratica');
    expect(sectionCountLabel(3.2)).toBe('3 pratiche');
  });

  it('clamps negatives to zero', () => {
    expect(sectionCountLabel(-5)).toBe('0 pratiche');
  });

  it('clamps NaN / Infinity to zero', () => {
    expect(sectionCountLabel(NaN)).toBe('0 pratiche');
    expect(sectionCountLabel(Infinity)).toBe('0 pratiche');
    expect(sectionCountLabel(-Infinity)).toBe('0 pratiche');
  });
});
