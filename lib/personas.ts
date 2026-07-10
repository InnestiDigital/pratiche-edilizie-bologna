/**
 * First-run PERSONAS — the "chi sei / perché sei qui" question onboarding asks
 * before the generic zone/category pickers, so a new user lands on a feed already
 * tuned to their actual task instead of the everything-selected default.
 *
 * These are grounded in who genuinely opens a Bologna civic-permit-data app (not
 * invented marketing segments): a technical professional doing property
 * due-diligence, someone buying/selling/valuing a home, a contractor tracking
 * roadworks near their sites, an engaged resident watching their neighbourhood,
 * and the "not sure — show me everything" fallback. Each maps to a concrete
 * default set of `interests` (civic categories) + `filingTypes` (edilizia
 * sub-procedures) that fits that task; the picker below stays fully editable, so
 * a persona is a smart starting point, never a lock-in.
 *
 * This is a PURE data+logic module (no React, no native) so the persona→defaults
 * mapping is unit-tested; the onboarding screen owns the icons + rendering.
 */
import { FILING_TYPE_ORDER, type FilingType } from './constants';
import { CATEGORIES, type Category } from './sources';

export const PERSONAS = [
  'professionista',
  'compravendita',
  'impresa',
  'cittadino',
  'esplora',
] as const;
export type Persona = (typeof PERSONAS)[number];

/** Everything selected — the shared default for the broad personas + the base a
 *  narrower persona trims from. Fresh arrays so callers can mutate safely. */
const ALL_INTERESTS: Category[] = [...CATEGORIES];
const ALL_FILING_TYPES: FilingType[] = [...FILING_TYPE_ORDER];

export interface PersonaProfile {
  /** Short card title — the role, in the user's own vocabulary. */
  label: string;
  /** One line: who this is + why they'd open the app (the "right first question"). */
  blurb: string;
  /** Present-tense, second-person framing of the feed for this role — the persona's
   *  voice IN the app (the feed header reads it), distinct from the picker-facing
   *  `blurb`. Their task, their vocabulary, so the feed doesn't read generic once
   *  onboarding is behind them. */
  feedIntro: string;
  /** Civic categories this persona follows by default. */
  interests: Category[];
  /** Edilizia filing types they follow (only relevant when `edilizia` is followed). */
  filingTypes: FilingType[];
}

/**
 * The persona registry. Exhaustive `Record<Persona, …>` so a new persona cannot
 * ship without deciding its copy + default filter set. Copy is Italian, tuned to
 * each role's vocabulary (a geometra reads "due diligence"; a resident reads
 * "il tuo quartiere").
 */
export const PERSONA_PROFILES: Record<Persona, PersonaProfile> = {
  // Geometra / architetto / tecnico: property due-diligence needs every edilizia
  // filing type (PDC/SCIA/CILA all matter) plus the cantieri that affect a site.
  professionista: {
    label: 'Tecnico',
    blurb: 'Geometra, architetto o tecnico: pratiche edilizie e cantieri per la due diligence.',
    feedIntro: 'Edilizia e cantieri per la tua due diligence.',
    interests: ['edilizia', 'cantieri'],
    filingTypes: [...ALL_FILING_TYPES],
  },
  // Buyer / seller / real-estate agent: what's being built (edilizia), what's
  // being dug up (cantieri) and what's opening (commercio) near an address.
  compravendita: {
    label: 'Compra / vende casa',
    blurb: 'Compri, vendi o valuti un immobile: cosa si costruisce, si scava e apre nella zona.',
    feedIntro: 'Cosa si costruisce, si scava e apre nella zona.',
    interests: ['edilizia', 'cantieri', 'commercio'],
    filingTypes: [...ALL_FILING_TYPES],
  },
  // Contractor / site operator: roadworks that affect routes + sites first, with
  // edilizia as the adjacent context.
  impresa: {
    label: 'Impresa / cantieri',
    blurb: 'Impresa o cantierista: lavori stradali e pratiche che toccano i tuoi siti.',
    feedIntro: 'Lavori stradali e pratiche sui tuoi cantieri.',
    interests: ['cantieri', 'edilizia'],
    filingTypes: [...ALL_FILING_TYPES],
  },
  // Engaged resident: the full picture of what changes in their neighbourhood —
  // works, citizen reports, events, new businesses, construction.
  cittadino: {
    label: 'Cittadino',
    blurb: 'Segui il tuo quartiere: cantieri, segnalazioni, eventi e nuove attività.',
    feedIntro: 'Il tuo quartiere: cantieri, segnalazioni, eventi.',
    interests: [...ALL_INTERESTS],
    filingTypes: [...ALL_FILING_TYPES],
  },
  // Not sure yet: follow everything, refine later. Reproduces the pre-persona
  // "all selected" default explicitly.
  esplora: {
    label: 'Esplora tutto',
    blurb: 'Non sei sicuro? Segui tutto e affina i filtri più tardi.',
    feedIntro: 'Tutte le categorie civiche di Bologna.',
    interests: [...ALL_INTERESTS],
    filingTypes: [...ALL_FILING_TYPES],
  },
};

/**
 * The default filter set for a persona — fresh arrays each call (the onboarding
 * screen seeds mutable `Set`s from them). `interests` is always non-empty and
 * `filingTypes` is always non-empty, so the returned set never blocks the
 * "Inizia" gate (which requires ≥1 interest, and ≥1 filing type iff edilizia is
 * followed).
 */
export function personaDefaults(persona: Persona): {
  interests: Category[];
  filingTypes: FilingType[];
} {
  const profile = PERSONA_PROFILES[persona];
  return {
    interests: [...profile.interests],
    filingTypes: [...profile.filingTypes],
  };
}

/**
 * The feed-header line for a persona — the role's task in its own voice, read by
 * the feed's persona header so the chosen persona keeps speaking past onboarding
 * (before this the persona only shaped the onboarding + Settings pickers).
 */
export function personaFeedIntro(persona: Persona): string {
  return PERSONA_PROFILES[persona].feedIntro;
}
