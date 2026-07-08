import { describe, it, expect } from 'vitest';
import {
  SOURCES,
  CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_NOUNS,
  CATEGORY_DETAIL_TITLE,
  CATEGORY_HAS_STATUS_SIGNAL,
  type Category,
} from './sources';
import { DATASETS, type DatasetKey } from './constants';

describe('SOURCES', () => {
  it('covers every edilizia dataset key', () => {
    for (const key of Object.keys(DATASETS) as DatasetKey[]) {
      expect(SOURCES[key]).toBeDefined();
      expect(SOURCES[key].category).toBe('edilizia');
    }
  });

  const ediliziaEntries = Object.entries(SOURCES).filter(
    ([, config]) => config.category === 'edilizia'
  );

  it.each(ediliziaEntries)('%s (edilizia) slug matches its DATASETS slug', (key, config) => {
    expect(config.slug).toBe(DATASETS[key as DatasetKey].slug);
  });

  it.each(Object.entries(SOURCES))('%s slug is a non-empty string', (_key, config) => {
    expect(typeof config.slug).toBe('string');
    expect(config.slug.length).toBeGreaterThan(0);
  });

  it.each(ediliziaEntries)(
    '%s (edilizia) carries its DATASETS label and filing token',
    (key, config) => {
      const dataset = DATASETS[key as DatasetKey];
      expect(config.label).toBe(dataset.label);
      expect(config.filingTypeToken).toBe(dataset.filingType);
    }
  );

  it.each(ediliziaEntries)(
    '%s (edilizia) sweeps per filing year via the ODS refine facet',
    (_key, config) => {
      // The year-refine variant carries no `field`: the facet is the single
      // YEAR_REFINE_FIELD constant, consumed by buildPageParams, not embedded here.
      expect(config.sweep).toEqual({ kind: 'year-refine' });
    }
  );

  it('lavori is the cantieri source: full sweep, CANTIERE token, own slug', () => {
    expect(SOURCES.lavori.category).toBe('cantieri');
    expect(SOURCES.lavori.slug).toBe('lavori-pubblici');
    expect(SOURCES.lavori.filingTypeToken).toBe('CANTIERE');
    expect(SOURCES.lavori.label).toBe('Cantieri stradali');
    expect(SOURCES.lavori.sweep).toEqual({ kind: 'full' });
  });

  it('commercio is the commercio source: date-range sweep on data_richiesta, COMMERCIO token', () => {
    expect(SOURCES.commercio.category).toBe('commercio');
    expect(SOURCES.commercio.slug).toBe('istanze-commercio');
    expect(SOURCES.commercio.filingTypeToken).toBe('COMMERCIO');
    expect(SOURCES.commercio.label).toBe('Attività commerciali');
    expect(SOURCES.commercio.sweep).toEqual({ kind: 'date-range', field: 'data_richiesta' });
  });

  it('eventi is the eventi source: future-window sweep on start, EVENTO token', () => {
    expect(SOURCES.eventi.category).toBe('eventi');
    expect(SOURCES.eventi.slug).toBe('eventi-bologna-agenda-cultura');
    expect(SOURCES.eventi.filingTypeToken).toBe('EVENTO');
    expect(SOURCES.eventi.label).toBe('Eventi culturali');
    expect(SOURCES.eventi.sweep).toEqual({
      kind: 'future-window',
      field: 'start',
      lookBackDays: 7,
    });
  });

  it('segnalazioni is the segnalazioni source: date-range sweep on data_inserimento, SEGNALAZIONE token', () => {
    expect(SOURCES.segnalazioni.category).toBe('segnalazioni');
    expect(SOURCES.segnalazioni.slug).toBe(
      'segnalazioni-open-citizen-relationship-management-czrm'
    );
    expect(SOURCES.segnalazioni.filingTypeToken).toBe('SEGNALAZIONE');
    expect(SOURCES.segnalazioni.label).toBe('Segnalazioni civiche');
    expect(SOURCES.segnalazioni.sweep).toEqual({ kind: 'date-range', field: 'data_inserimento' });
    expect(SOURCES.segnalazioni.fullScanFromYear).toBe(2015);
  });

  it('has no duplicate slugs across entries', () => {
    const slugs = Object.values(SOURCES).map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every category used in the registry is a valid Category', () => {
    for (const config of Object.values(SOURCES)) {
      expect(CATEGORIES).toContain(config.category);
    }
  });
});

describe('CATEGORIES / DEFAULT_CATEGORY', () => {
  it('is the five-member civic-category union', () => {
    expect(CATEGORIES).toEqual(['edilizia', 'cantieri', 'commercio', 'eventi', 'segnalazioni']);
  });

  it('DEFAULT_CATEGORY is a member of CATEGORIES', () => {
    expect(CATEGORIES).toContain(DEFAULT_CATEGORY);
  });
});

describe('CATEGORY_* maps', () => {
  it.each(CATEGORIES)(
    'has an exhaustive label / color / noun entry for %s',
    (category: Category) => {
      expect(typeof CATEGORY_LABELS[category]).toBe('string');
      expect(CATEGORY_LABELS[category].length).toBeGreaterThan(0);

      expect(CATEGORY_COLORS[category].bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(CATEGORY_COLORS[category].text).toMatch(/^#[0-9A-Fa-f]{6}$/);

      expect(CATEGORY_NOUNS[category].singularNew.length).toBeGreaterThan(0);
      expect(CATEGORY_NOUNS[category].pluralNew.length).toBeGreaterThan(0);

      expect(typeof CATEGORY_DETAIL_TITLE[category]).toBe('string');
      expect(CATEGORY_DETAIL_TITLE[category].length).toBeGreaterThan(0);
    }
  );

  it('keys each map by exactly the CATEGORIES members', () => {
    const expected = [...CATEGORIES].sort();
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_NOUNS).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_DETAIL_TITLE).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_HAS_STATUS_SIGNAL).sort()).toEqual(expected);
  });

  it('gives each category a category-specific detail-screen title', () => {
    // The rebrand's category-neutral promise: no non-edilizia row reads "Pratica".
    expect(CATEGORY_DETAIL_TITLE.edilizia).toBe('Dettaglio Pratica');
    expect(CATEGORY_DETAIL_TITLE.cantieri).toBe('Dettaglio Cantiere');
    expect(CATEGORY_DETAIL_TITLE.commercio).toBe('Dettaglio Attività');
    expect(CATEGORY_DETAIL_TITLE.eventi).toBe('Dettaglio Evento');
    expect(CATEGORY_DETAIL_TITLE.segnalazioni).toBe('Dettaglio Segnalazione');
    // Only edilizia keeps the word "Pratica".
    for (const c of CATEGORIES) {
      if (c !== 'edilizia') expect(CATEGORY_DETAIL_TITLE[c]).not.toMatch(/Pratica/);
    }
  });
});

describe('CATEGORY_HAS_STATUS_SIGNAL', () => {
  it('is true only for the categories with a real upstream status', () => {
    expect(CATEGORY_HAS_STATUS_SIGNAL.edilizia).toBe(true);
    expect(CATEGORY_HAS_STATUS_SIGNAL.cantieri).toBe(true);
    expect(CATEGORY_HAS_STATUS_SIGNAL.commercio).toBe(true);
    // Eventi/segnalazioni statuses are normalizer constants — no signal.
    expect(CATEGORY_HAS_STATUS_SIGNAL.eventi).toBe(false);
    expect(CATEGORY_HAS_STATUS_SIGNAL.segnalazioni).toBe(false);
  });
});
