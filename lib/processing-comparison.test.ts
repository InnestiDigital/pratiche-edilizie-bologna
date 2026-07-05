import { describe, it, expect } from 'vitest';
import { buildProcessingComparison } from './processing-comparison';
import type { ProcessingStats } from './processing-stats';

// Median 70 days ("2 mesi"); band = max(7, round(70*0.2)=14) = 14 → [56, 84].
const STATS: ProcessingStats = { count: 5, medianDays: 70, minDays: 23, maxDays: 98 };

describe('buildProcessingComparison', () => {
  it('marks a span comfortably below the band as faster', () => {
    // 2024-11-02 → 2024-11-25 = 23 days, well under 56.
    const c = buildProcessingComparison('2024-11-02', '2024-11-25', STATS);
    expect(c).toEqual({ tone: 'faster', label: 'Più veloce della media (mediana 2 mesi)' });
  });

  it('marks a span comfortably above the band as slower', () => {
    // 2024-08-14 → 2024-11-20 = 98 days, over 84.
    const c = buildProcessingComparison('2024-08-14', '2024-11-20', STATS);
    expect(c).toEqual({ tone: 'slower', label: 'Più lenta della media (mediana 2 mesi)' });
  });

  it('marks a span inside the tolerance band as typical', () => {
    // 2024-08-14 → 2024-10-23 = 70 days, exactly the median.
    const c = buildProcessingComparison('2024-08-14', '2024-10-23', STATS);
    expect(c).toEqual({ tone: 'typical', label: 'In linea con la media (mediana 2 mesi)' });
  });

  it('treats the band edges as still typical (inclusive)', () => {
    // median 70, band 14 → 56 and 84 are the boundaries and must not tip over.
    const lo = buildProcessingComparison('2024-01-01', '2024-02-26', STATS); // 56 days
    const hi = buildProcessingComparison('2024-01-01', '2024-03-25', STATS); // 84 days
    expect(lo?.tone).toBe('typical');
    expect(hi?.tone).toBe('typical');
  });

  it('uses a 7-day floor for the band when the median is tiny', () => {
    // median 10 → 20% = 2, floored to 7 → band [3, 17]. 20 days is slower.
    const small: ProcessingStats = { count: 6, medianDays: 10, minDays: 2, maxDays: 40 };
    expect(buildProcessingComparison('2024-01-01', '2024-01-21', small)?.tone).toBe('slower');
    // 15 days is inside [3, 17] → typical despite being 50% over the median.
    expect(buildProcessingComparison('2024-01-01', '2024-01-16', small)?.tone).toBe('typical');
  });

  it('returns null when there are too few local peers', () => {
    const thin: ProcessingStats = { count: 3, medianDays: 70, minDays: 23, maxDays: 98 };
    expect(buildProcessingComparison('2024-11-02', '2024-11-25', thin)).toBeNull();
    // A caller-supplied minPeers is honoured.
    expect(buildProcessingComparison('2024-11-02', '2024-11-25', STATS, 6)).toBeNull();
  });

  it('returns null when the aggregate is absent', () => {
    expect(buildProcessingComparison('2024-11-02', '2024-11-25', null)).toBeNull();
  });

  it('returns null when the permit has no usable own span', () => {
    expect(buildProcessingComparison(null, '2024-11-25', STATS)).toBeNull();
    expect(buildProcessingComparison('2024-11-02', null, STATS)).toBeNull();
    // Backwards dates (closing before request) → no honest comparison.
    expect(buildProcessingComparison('2024-11-25', '2024-11-02', STATS)).toBeNull();
  });
});
