import { describe, it, expect } from 'vitest';
import { PERSONAS, PERSONA_PROFILES, personaDefaults, type Persona } from './personas';
import { CATEGORIES, type Category } from './sources';
import { FILING_TYPE_ORDER, type FilingType } from './constants';

describe('personas registry', () => {
  it('has a profile for every persona and no extras', () => {
    expect(Object.keys(PERSONA_PROFILES).sort()).toEqual([...PERSONAS].sort());
  });

  it('every persona has non-empty label + blurb copy', () => {
    for (const p of PERSONAS) {
      const profile = PERSONA_PROFILES[p];
      expect(profile.label.trim().length).toBeGreaterThan(0);
      expect(profile.blurb.trim().length).toBeGreaterThan(0);
    }
  });

  it('every persona follows at least one interest', () => {
    for (const p of PERSONAS) {
      expect(PERSONA_PROFILES[p].interests.length).toBeGreaterThan(0);
    }
  });

  it('every persona has at least one filing type (never blocks the edilizia gate)', () => {
    for (const p of PERSONAS) {
      expect(PERSONA_PROFILES[p].filingTypes.length).toBeGreaterThan(0);
    }
  });

  it('only references known categories and filing types', () => {
    const validCategories = new Set<Category>(CATEGORIES);
    const validFilings = new Set<FilingType>(FILING_TYPE_ORDER);
    for (const p of PERSONAS) {
      for (const c of PERSONA_PROFILES[p].interests) {
        expect(validCategories.has(c)).toBe(true);
      }
      for (const f of PERSONA_PROFILES[p].filingTypes) {
        expect(validFilings.has(f)).toBe(true);
      }
    }
  });

  it('has no duplicate interest or filing entries within a persona', () => {
    for (const p of PERSONAS) {
      const { interests, filingTypes } = PERSONA_PROFILES[p];
      expect(new Set(interests).size).toBe(interests.length);
      expect(new Set(filingTypes).size).toBe(filingTypes.length);
    }
  });
});

describe('personaDefaults', () => {
  it('returns the profile filter set for each persona', () => {
    for (const p of PERSONAS) {
      const d = personaDefaults(p);
      expect(new Set(d.interests)).toEqual(new Set(PERSONA_PROFILES[p].interests));
      expect(new Set(d.filingTypes)).toEqual(new Set(PERSONA_PROFILES[p].filingTypes));
    }
  });

  it('returns fresh arrays that do not alias the registry (mutation-safe)', () => {
    const d = personaDefaults('professionista');
    d.interests.push('eventi');
    d.filingTypes.pop();
    // Registry untouched by the caller mutating the returned arrays.
    expect(PERSONA_PROFILES.professionista.interests).not.toContain('eventi');
    expect(PERSONA_PROFILES.professionista.filingTypes.length).toBe(FILING_TYPE_ORDER.length);
  });

  it('tailors the narrow personas (not everything selected)', () => {
    // Tecnico = edilizia + cantieri only, not commercio/eventi/segnalazioni.
    const tecnico = personaDefaults('professionista');
    expect(new Set(tecnico.interests)).toEqual(new Set<Category>(['edilizia', 'cantieri']));
    // Compravendita adds commercio.
    const casa = personaDefaults('compravendita');
    expect(casa.interests).toContain('commercio');
    expect(casa.interests).not.toContain('segnalazioni');
  });

  it('esplora and cittadino follow every category', () => {
    for (const p of ['esplora', 'cittadino'] as Persona[]) {
      expect(new Set(personaDefaults(p).interests)).toEqual(new Set(CATEGORIES));
    }
  });
});
