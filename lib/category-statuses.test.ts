import { describe, it, expect } from 'vitest';
import {
  CATEGORY_STATUSES,
  applicableStatuses,
  pruneStatusesForCategory,
} from './category-statuses';
import { STATUS_LABELS, STATUS_PATTERNS } from './constants';
import { CATEGORIES, CATEGORY_HAS_STATUS_SIGNAL } from './sources';

describe('CATEGORY_STATUSES', () => {
  it('declares a status vocabulary for every category (exhaustive)', () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_STATUSES[cat], `missing statuses for ${cat}`).toBeDefined();
      expect(CATEGORY_STATUSES[cat].length).toBeGreaterThan(0);
    }
  });

  it('every declared status has a human label (no dead chip)', () => {
    for (const cat of CATEGORIES) {
      for (const s of CATEGORY_STATUSES[cat]) {
        expect(STATUS_LABELS[s], `${cat} status "${s}" has no label`).toBeDefined();
      }
    }
  });

  it('edilizia vocabulary is the STATUS_PATTERNS keys plus the "altro" fallback', () => {
    const expected = new Set([...STATUS_PATTERNS.map(([k]) => k), 'altro']);
    expect(new Set(CATEGORY_STATUSES.edilizia)).toEqual(expected);
  });

  it('commercio reuses the edilizia vocabulary (same normalizer)', () => {
    expect(CATEGORY_STATUSES.commercio).toEqual(CATEGORY_STATUSES.edilizia);
  });

  it('cantieri owns its two-state vocabulary + fallback', () => {
    expect(new Set(CATEGORY_STATUSES.cantieri)).toEqual(new Set(['in_corso', 'concluso', 'altro']));
  });
});

describe('applicableStatuses', () => {
  it('returns null under the unscoped "Tutte" view (nothing is dead)', () => {
    expect(applicableStatuses(null)).toBeNull();
  });

  it('returns an EMPTY set for no-signal categories (Stato section hidden)', () => {
    for (const cat of CATEGORIES) {
      if (!CATEGORY_HAS_STATUS_SIGNAL[cat]) {
        const set = applicableStatuses(cat);
        expect(set, `${cat} should scope`).not.toBeNull();
        expect(set!.size, `${cat} should hide Stato`).toBe(0);
      }
    }
  });

  it('scopes edilizia to its own outcomes and excludes other categories’ statuses', () => {
    const set = applicableStatuses('edilizia')!;
    expect(set.has('rilasciata')).toBe(true);
    expect(set.has('altro')).toBe(true);
    expect(set.has('in_corso')).toBe(false); // cantieri-only
    expect(set.has('in_programma')).toBe(false); // eventi-only
  });

  it('scopes cantieri to its two states only', () => {
    const set = applicableStatuses('cantieri')!;
    expect(set.has('in_corso')).toBe(true);
    expect(set.has('concluso')).toBe(true);
    expect(set.has('rilasciata')).toBe(false); // edilizia-only
    expect(set.has('diniegata')).toBe(false);
  });
});

describe('pruneStatusesForCategory', () => {
  it('leaves the selection untouched under "Tutte" (returns a copy)', () => {
    const active = new Set(['rilasciata', 'in_corso']);
    const pruned = pruneStatusesForCategory(active, null);
    expect(pruned).toEqual(active);
    expect(pruned).not.toBe(active); // fresh set, not the same reference
  });

  it('drops statuses that cannot match the newly selected category', () => {
    // Reviewer picks Cantieri while an edilizia-only outcome was active — that
    // status can never match a cantiere row, so it must be dropped (else the feed
    // silently empties). "concluso" is shared, so it survives.
    const active = new Set(['rilasciata', 'concluso']);
    const pruned = pruneStatusesForCategory(active, 'cantieri');
    expect([...pruned].sort()).toEqual(['concluso']);
  });

  it('clears every status when narrowing to a no-signal category', () => {
    const active = new Set(['rilasciata', 'concluso']);
    expect(pruneStatusesForCategory(active, 'eventi').size).toBe(0);
  });

  it('keeps a still-applicable status after a category switch', () => {
    const active = new Set(['rilasciata']);
    expect(pruneStatusesForCategory(active, 'commercio')).toEqual(new Set(['rilasciata']));
  });
});
