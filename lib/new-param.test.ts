import { describe, it, expect } from 'vitest';
import { parseNewParam } from './new-param';

describe('parseNewParam', () => {
  it('activates the filter for the canonical token', () => {
    expect(parseNewParam('1')).toBe(true);
  });

  it('normalizes the array form to its first element', () => {
    expect(parseNewParam(['1'])).toBe(true);
    expect(parseNewParam(['1', '0'])).toBe(true);
    expect(parseNewParam(['0', '1'])).toBe(false);
  });

  it('does not activate for missing / junk / stale / wrong-shape values', () => {
    expect(parseNewParam(undefined)).toBe(false);
    expect(parseNewParam('')).toBe(false);
    expect(parseNewParam('0')).toBe(false);
    expect(parseNewParam('true')).toBe(false);
    expect(parseNewParam('new')).toBe(false);
    expect(parseNewParam([])).toBe(false);
    expect(parseNewParam([''])).toBe(false);
  });
});
