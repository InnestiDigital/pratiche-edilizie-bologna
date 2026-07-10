import type { Persona } from './personas';

/**
 * Pure core for the feed's persona voice header (director mandate #2, `c24e811`):
 * once a persona is chosen it speaks a tailored one-liner at the top of the feed.
 * The device-coupled `PersonaFeedHeader` (a SectionList `ListHeaderComponent`)
 * delegates the show/hide decision here so it stays thin.
 *
 * The header must sit ONLY above real feed rows. A `ListHeaderComponent` renders
 * even for an empty SectionList, so gating it on "the DB has base-preference data"
 * was wrong: any in-feed refinement (search, "Solo salvate"/"Solo con note", a
 * status/tag filter, the time period, the radius) can narrow a populated DB down
 * to zero rows, and then the persona line would float ABOVE the empty state
 * ("nessun risultato"). The correct gate is whether the CURRENT feed — after every
 * refinement — actually has rows to head, which is what `hasRows` carries.
 */

/** The three inputs that decide whether the feed's persona header should show. */
export interface PersonaHeaderState {
  /** The chosen persona, or null when none is set (fresh install / cleared). */
  persona: Persona | null;
  /** Whether the CURRENT (fully refined) feed has any rows to sit above. */
  hasRows: boolean;
  /** Whether the feed is still loading (never head a skeleton). */
  loading: boolean;
}

/**
 * Show the persona voice header only when it heads real content: a persona is set,
 * the current feed has rows, and it is not loading. A null persona (pre-persona
 * upgrader / cleared role) or an empty/loading feed suppresses it — so it never
 * sits above a skeleton or an empty state, in any filter combination.
 */
export function shouldShowPersonaHeader({
  persona,
  hasRows,
  loading,
}: PersonaHeaderState): boolean {
  return persona !== null && hasRows && !loading;
}
