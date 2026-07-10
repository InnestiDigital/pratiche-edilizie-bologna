import { describe, it, expect } from 'vitest';
import { statusTransitionWrite, statusChangeLine } from './status-transition';

describe('statusTransitionWrite', () => {
  it('persists prior status + timestamp on a real status flip in an updated row', () => {
    expect(
      statusTransitionWrite('in_corso', 'concluso', 'updated', '2026-07-10T08:00:00.000Z')
    ).toEqual({ previous_status: 'in_corso', status_changed_at: '2026-07-10T08:00:00.000Z' });
  });

  it('returns null when the status is unchanged (a non-status content correction)', () => {
    // Same status, but classifyUpsert said `updated` because e.g. address/tags moved.
    expect(
      statusTransitionWrite('concluso', 'concluso', 'updated', '2026-07-10T08:00:00.000Z')
    ).toBeNull();
  });

  it('returns null for a fresh insert (no prior state to transition from)', () => {
    expect(
      statusTransitionWrite('in_corso', 'concluso', 'inserted', '2026-07-10T08:00:00.000Z')
    ).toBeNull();
  });

  it('returns null for an unchanged row', () => {
    expect(
      statusTransitionWrite('in_corso', 'concluso', 'unchanged', '2026-07-10T08:00:00.000Z')
    ).toBeNull();
  });
});

describe('statusChangeLine', () => {
  it('renders a category-voiced line for a followed permit whose status moved', () => {
    // edilizia is feminine → `concluso` overrides to "Conclusa".
    expect(statusChangeLine('rilasciata', 'concluso', 'edilizia', 'Conclusa')).toEqual({
      current: 'Conclusa',
      previous: 'Rilasciata',
    });
  });

  it('voices a cantiere transition in the masculine (no override)', () => {
    expect(statusChangeLine('in_corso', 'concluso', 'cantieri', 'Concluso')).toEqual({
      current: 'Concluso',
      previous: 'In corso',
    });
  });

  it('returns null when there is no prior status (never transitioned / first seen)', () => {
    expect(statusChangeLine(null, 'concluso', 'edilizia', 'Conclusa')).toBeNull();
    expect(statusChangeLine(undefined, 'concluso', 'edilizia', 'Conclusa')).toBeNull();
    expect(statusChangeLine('', 'concluso', 'edilizia', 'Conclusa')).toBeNull();
  });

  it('returns null defensively when a mis-written prior status equals the current one', () => {
    expect(statusChangeLine('concluso', 'concluso', 'edilizia', 'Conclusa')).toBeNull();
  });

  it('falls back to the raw token for an unknown prior status without crashing', () => {
    expect(statusChangeLine('stato_ignoto', 'rilasciata', 'edilizia', 'Rilasciata')).toEqual({
      current: 'Rilasciata',
      previous: 'stato_ignoto',
    });
  });
});
