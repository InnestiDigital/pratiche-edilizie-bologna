import { describe, it, expect } from 'vitest';
import {
  SOURCES,
  CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_NOUNS,
  CATEGORY_DETAIL_TITLE,
  CATEGORY_REFERENCE_LABEL,
  CATEGORY_REFERENCE_LABEL_LONG,
  CATEGORY_HAS_STATUS_SIGNAL,
  CATEGORY_HAS_RELEASE_TIME,
  RELEASE_TIME_CATEGORIES,
  CATEGORY_DESCRIPTIONS,
  datasetLabelFor,
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

      expect(typeof CATEGORY_REFERENCE_LABEL[category]).toBe('string');
      expect(CATEGORY_REFERENCE_LABEL[category].length).toBeGreaterThan(0);

      expect(typeof CATEGORY_REFERENCE_LABEL_LONG[category]).toBe('string');
      expect(CATEGORY_REFERENCE_LABEL_LONG[category].length).toBeGreaterThan(0);

      // Every category has a plain-Italian detail explainer (a full sentence).
      expect(typeof CATEGORY_DESCRIPTIONS[category]).toBe('string');
      expect(CATEGORY_DESCRIPTIONS[category].length).toBeGreaterThan(10);
    }
  );

  it('keys each map by exactly the CATEGORIES members', () => {
    const expected = [...CATEGORIES].sort();
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_NOUNS).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_DETAIL_TITLE).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_REFERENCE_LABEL).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_REFERENCE_LABEL_LONG).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_HAS_STATUS_SIGNAL).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_HAS_RELEASE_TIME).sort()).toEqual(expected);
    expect(Object.keys(CATEGORY_DESCRIPTIONS).sort()).toEqual(expected);
  });

  it('labels the detail id line "Prot." only where the id is a real protocollo', () => {
    // edilizia + commercio source_ids are administrative protocolli.
    expect(CATEGORY_REFERENCE_LABEL.edilizia).toBe('Prot.');
    expect(CATEGORY_REFERENCE_LABEL.commercio).toBe('Prot.');
    // cantieri/eventi/segnalazioni carry a record/ticket id, not a protocollo —
    // labelling them "Prot." would be edilizia copy bleed.
    expect(CATEGORY_REFERENCE_LABEL.cantieri).toBe('Rif.');
    expect(CATEGORY_REFERENCE_LABEL.eventi).toBe('Rif.');
    expect(CATEGORY_REFERENCE_LABEL.segnalazioni).toBe('Rif.');
  });

  it('spells out the same protocollo/riferimento split in the long-form label', () => {
    // The prose (share) surface uses full words; the semantic split must match
    // the abbreviated map so the two never drift.
    expect(CATEGORY_REFERENCE_LABEL_LONG.edilizia).toBe('Protocollo');
    expect(CATEGORY_REFERENCE_LABEL_LONG.commercio).toBe('Protocollo');
    expect(CATEGORY_REFERENCE_LABEL_LONG.cantieri).toBe('Riferimento');
    expect(CATEGORY_REFERENCE_LABEL_LONG.eventi).toBe('Riferimento');
    expect(CATEGORY_REFERENCE_LABEL_LONG.segnalazioni).toBe('Riferimento');
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

describe('datasetLabelFor', () => {
  it('maps a stored dataset key to its human source label', () => {
    // Non-edilizia keys: the detail "Dataset" row + explainer card read the human
    // label, not the raw uppercase key ("Eventi culturali", not "EVENTI").
    expect(datasetLabelFor('eventi')).toBe('Eventi culturali');
    expect(datasetLabelFor('lavori')).toBe('Cantieri stradali');
    expect(datasetLabelFor('commercio')).toBe('Attività commerciali');
    expect(datasetLabelFor('segnalazioni')).toBe('Segnalazioni civiche');
    // Edilizia keys carry their DATASETS label.
    expect(datasetLabelFor('pdc')).toBe('Permesso di Costruire');
  });

  it('falls back to the raw key for an unknown dataset', () => {
    expect(datasetLabelFor('nonexistent')).toBe('nonexistent');
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

describe('CATEGORY_HAS_RELEASE_TIME / RELEASE_TIME_CATEGORIES', () => {
  it('marks only the istanza→esito filing categories as release-time', () => {
    // edilizia + commercio: source_updated_at → date_issued is a real
    // request → release span.
    expect(CATEGORY_HAS_RELEASE_TIME.edilizia).toBe(true);
    expect(CATEGORY_HAS_RELEASE_TIME.commercio).toBe(true);
    // cantieri's span is effectivestartdate → effectiveenddate (works duration),
    // NOT a permit release time — must stay out of the "Tempi di rilascio" pool
    // even though its concluded rows normalize to the RELEASED_STATUS 'concluso'.
    expect(CATEGORY_HAS_RELEASE_TIME.cantieri).toBe(false);
    expect(CATEGORY_HAS_RELEASE_TIME.eventi).toBe(false);
    expect(CATEGORY_HAS_RELEASE_TIME.segnalazioni).toBe(false);
  });

  it('derives RELEASE_TIME_CATEGORIES from the map, excluding cantieri', () => {
    expect(RELEASE_TIME_CATEGORIES).toEqual(['edilizia', 'commercio']);
    expect(RELEASE_TIME_CATEGORIES).not.toContain('cantieri');
    for (const c of RELEASE_TIME_CATEGORIES) {
      expect(CATEGORY_HAS_RELEASE_TIME[c]).toBe(true);
    }
  });
});
