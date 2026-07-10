import { describe, expect, it } from 'vitest';
import { shouldShowPersonaHeader } from './persona-header';
import type { Persona } from './personas';

const PROFESSIONISTA: Persona = 'professionista';

describe('shouldShowPersonaHeader', () => {
  it('shows when a persona is set, the feed has rows, and it is not loading', () => {
    expect(
      shouldShowPersonaHeader({ persona: PROFESSIONISTA, hasRows: true, loading: false })
    ).toBe(true);
  });

  it('hides when no persona is set (pre-persona / cleared role)', () => {
    expect(shouldShowPersonaHeader({ persona: null, hasRows: true, loading: false })).toBe(false);
  });

  it('hides when the current feed has no rows — the core fix: a refinement (search / Solo salvate / status / period) can empty a populated DB, and the header must not float above the empty state', () => {
    expect(
      shouldShowPersonaHeader({ persona: PROFESSIONISTA, hasRows: false, loading: false })
    ).toBe(false);
  });

  it('hides while loading so it never heads a skeleton', () => {
    expect(shouldShowPersonaHeader({ persona: PROFESSIONISTA, hasRows: true, loading: true })).toBe(
      false
    );
  });

  it('stays hidden when both persona is null and the feed is empty', () => {
    expect(shouldShowPersonaHeader({ persona: null, hasRows: false, loading: false })).toBe(false);
  });
});
