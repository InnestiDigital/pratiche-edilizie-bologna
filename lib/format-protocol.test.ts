import { describe, it, expect } from 'vitest';
import { formatProtocol } from './format-protocol';

describe('formatProtocol', () => {
  it('formats a normal source_id as number/year, dropping the dataset prefix', () => {
    expect(formatProtocol('PDC-2024-000481')).toBe('000481/2024');
    expect(formatProtocol('scia-2023-2210')).toBe('2210/2023');
    expect(formatProtocol('cila-2022-5567')).toBe('5567/2022');
  });

  it('preserves a numeric protocol number verbatim (no padding/parsing)', () => {
    expect(formatProtocol('PDC-2024-481')).toBe('481/2024');
  });

  it('falls back to the year alone when the number is missing', () => {
    expect(formatProtocol('PDC-2024')).toBe('2024');
    expect(formatProtocol('PDC-2024-')).toBe('2024');
  });

  it('falls back to the number alone when the year is missing', () => {
    expect(formatProtocol('PDC--000481')).toBe('000481');
  });

  it('returns the raw (trimmed) id for an unexpected single-token shape', () => {
    expect(formatProtocol('PDC')).toBe('PDC');
    expect(formatProtocol('  legacyid  ')).toBe('legacyid');
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(formatProtocol(null)).toBe('');
    expect(formatProtocol(undefined)).toBe('');
    expect(formatProtocol('')).toBe('');
  });

  it('trims whitespace around the number and year components', () => {
    expect(formatProtocol('PDC- 2024 - 000481 ')).toBe('000481/2024');
  });

  it('ignores trailing tokens beyond number/year', () => {
    expect(formatProtocol('PDC-2024-000481-extra')).toBe('000481/2024');
  });
});
