import { describe, it, expect } from 'vitest';
import { processingSpanDays, buildProcessingStats, processingRangeLabel } from './processing-stats';

describe('processingSpanDays', () => {
  it('counts whole days from request to closing', () => {
    expect(processingSpanDays('2024-11-02', '2024-11-25')).toBe(23);
    expect(processingSpanDays('2024-08-14', '2024-11-20')).toBe(98);
  });

  it('returns 0 for a same-day request and closing', () => {
    expect(processingSpanDays('2024-07-01', '2024-07-01')).toBe(0);
  });

  it('drops a closing that precedes the request (messy data)', () => {
    expect(processingSpanDays('2024-11-18', '2024-11-15')).toBeNull();
  });

  it('drops a pair with a missing or unparseable date', () => {
    expect(processingSpanDays(null, '2024-11-25')).toBeNull();
    expect(processingSpanDays('2024-11-02', null)).toBeNull();
    expect(processingSpanDays('', '2024-11-25')).toBeNull();
    expect(processingSpanDays('nope', '2024-11-25')).toBeNull();
  });

  it('ignores a trailing time component, using the date prefix', () => {
    expect(processingSpanDays('2024-11-02T00:00:00Z', '2024-11-09T23:59:59Z')).toBe(7);
  });
});

describe('buildProcessingStats', () => {
  it('summarizes median / min / max over valid spans (odd count)', () => {
    // spans: 23, 47, 70, 74, 98 → sorted → median 70
    const stats = buildProcessingStats([
      { request: '2024-11-02', closing: '2024-11-25' }, // 23
      { request: '2024-06-19', closing: '2024-08-05' }, // 47
      { request: '2024-11-18', closing: '2025-01-27' }, // 70
      { request: '2023-10-05', closing: '2023-12-18' }, // 74
      { request: '2024-08-14', closing: '2024-11-20' }, // 98
    ]);
    expect(stats).toEqual({ count: 5, medianDays: 70, minDays: 23, maxDays: 98 });
  });

  it('averages the two middle spans for an even count', () => {
    // spans: 10, 20, 30, 40 → median = round((20+30)/2) = 25
    const stats = buildProcessingStats([
      { request: '2024-01-01', closing: '2024-01-11' }, // 10
      { request: '2024-01-01', closing: '2024-01-21' }, // 20
      { request: '2024-01-01', closing: '2024-01-31' }, // 30
      { request: '2024-01-01', closing: '2024-02-10' }, // 40
    ]);
    expect(stats).toEqual({ count: 4, medianDays: 25, minDays: 10, maxDays: 40 });
  });

  it('excludes invalid pairs from both the sample and the min/max', () => {
    const stats = buildProcessingStats([
      { request: '2024-01-01', closing: '2024-01-11' }, // 10 valid
      { request: '2024-01-01', closing: '2024-01-21' }, // 20 valid
      { request: '2024-01-01', closing: '2024-01-31' }, // 30 valid
      { request: '2024-02-01', closing: '2024-01-01' }, // backwards → dropped
      { request: null, closing: '2024-01-01' }, // missing → dropped
    ]);
    expect(stats).toEqual({ count: 3, medianDays: 20, minDays: 10, maxDays: 30 });
  });

  it('returns null below the minimum sample size', () => {
    expect(
      buildProcessingStats([
        { request: '2024-01-01', closing: '2024-01-11' },
        { request: '2024-01-01', closing: '2024-01-21' },
      ])
    ).toBeNull();
    expect(buildProcessingStats([])).toBeNull();
  });

  it('honors a custom minimum sample size', () => {
    const pairs = [{ request: '2024-01-01', closing: '2024-01-11' }];
    expect(buildProcessingStats(pairs, 1)).toEqual({
      count: 1,
      medianDays: 10,
      minDays: 10,
      maxDays: 10,
    });
  });
});

describe('processingRangeLabel', () => {
  it('renders a from/to range across distinct span phrases', () => {
    expect(processingRangeLabel({ count: 5, medianDays: 70, minDays: 23, maxDays: 98 })).toBe(
      'da 3 settimane a 3 mesi'
    );
  });

  it('collapses to a single phrase when min and max read the same', () => {
    // 61 and 68 days both map to "2 mesi"
    expect(processingRangeLabel({ count: 4, medianDays: 64, minDays: 61, maxDays: 68 })).toBe(
      '2 mesi'
    );
  });
});
