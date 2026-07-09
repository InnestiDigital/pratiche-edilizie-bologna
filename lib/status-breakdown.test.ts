import { describe, it, expect } from 'vitest';
import { buildStatusBreakdown, STATUS_COLORS } from './status-breakdown';
import { STATUS_LABELS } from './constants';

describe('buildStatusBreakdown', () => {
  it('returns an empty list for an empty map', () => {
    expect(buildStatusBreakdown({}, 0)).toEqual([]);
  });

  it('maps status keys to Italian labels and accent colors', () => {
    const [entry] = buildStatusBreakdown({ rilasciata: 4 }, 4);
    expect(entry).toEqual({
      status: 'rilasciata',
      label: 'Rilasciata',
      color: STATUS_COLORS.rilasciata,
      count: 4,
      pct: 100,
    });
  });

  it('sorts by count descending', () => {
    const out = buildStatusBreakdown({ rilasciata: 1, concluso: 5, in_attesa: 3 }, 9);
    expect(out.map((e) => e.status)).toEqual(['concluso', 'in_attesa', 'rilasciata']);
  });

  it('breaks count ties by label ascending (it-locale)', () => {
    // concluso vs in_attesa both count 2 → "Concluso" before "In attesa"
    const out = buildStatusBreakdown({ in_attesa: 2, concluso: 2 }, 4);
    expect(out.map((e) => e.status)).toEqual(['concluso', 'in_attesa']);
  });

  it('computes percentage of the total, clamped to 0..100', () => {
    const out = buildStatusBreakdown({ concluso: 3, rilasciata: 1 }, 4);
    expect(out.find((e) => e.status === 'concluso')?.pct).toBeCloseTo(75);
    expect(out.find((e) => e.status === 'rilasciata')?.pct).toBeCloseTo(25);
  });

  it('yields pct 0 when the total is non-positive (avoids divide-by-zero)', () => {
    const out = buildStatusBreakdown({ concluso: 3 }, 0);
    expect(out[0].pct).toBe(0);
    expect(out[0].count).toBe(3);
  });

  it('never lets a stray count exceed 100% of a smaller total', () => {
    // A malformed stat where a bucket count is larger than the reported total.
    const out = buildStatusBreakdown({ concluso: 10 }, 4);
    expect(out[0].pct).toBe(100);
  });

  it('drops zero, negative, NaN, Infinity and it keeps floored fractional counts', () => {
    const out = buildStatusBreakdown(
      {
        concluso: 0,
        rilasciata: -3,
        in_attesa: Number.NaN,
        diniegata: Number.POSITIVE_INFINITY,
        archiviata: 2.9,
      },
      3
    );
    expect(out.map((e) => e.status)).toEqual(['archiviata']);
    expect(out[0].count).toBe(2); // 2.9 floored
  });

  it('falls back to the Altro label and neutral color for an unknown status', () => {
    const [entry] = buildStatusBreakdown({ qualcosa_di_strano: 1 }, 1);
    expect(entry.label).toBe('Altro');
    expect(entry.color).toBe('#9ca3af');
  });

  it('is a pure read — does not mutate the input map', () => {
    const input = { concluso: 3, rilasciata: 1 };
    const snapshot = { ...input };
    buildStatusBreakdown(input, 4);
    expect(input).toEqual(snapshot);
  });

  // STATUS_COLORS is the single source of truth for the status-dot palette shared
  // by the feed, filter panel, detail and sync screens. If a status has a label but
  // no color it silently falls back to grey on every surface — exactly the drift
  // (in_corso / in_programma greyed on detail while purple/blue elsewhere) this
  // guard prevents. Every labelled status must carry an accent color.
  it('assigns an accent color to every labelled status (no grey-fallback drift)', () => {
    for (const status of Object.keys(STATUS_LABELS)) {
      expect(STATUS_COLORS[status], `missing color for status "${status}"`).toBeDefined();
    }
  });
});
