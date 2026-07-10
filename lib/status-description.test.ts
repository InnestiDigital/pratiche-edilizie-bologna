import { describe, it, expect } from 'vitest';
import { statusDescriptionFor } from './status-description';
import { STATUS_DESCRIPTIONS } from './constants';

// The detail screen shows a plain-Italian caption under the status pill via
// statusDescriptionFor(permit.status, permit.category). The shared STATUS_DESCRIPTIONS
// map is edilizia-worded ("titolo edilizio", "lavori"); these checks guard that
// commercio (a business filing, not a building permit) never renders that jargon,
// while every other category keeps the shared copy verbatim.
describe('statusDescriptionFor', () => {
  const jargon = /titolo edilizio|lavori|intervento/i;

  it('gives commercio a business-worded caption for "rilasciata" (no edilizia jargon)', () => {
    const desc = statusDescriptionFor('rilasciata', 'commercio');
    expect(desc).toBeDefined();
    expect(desc).not.toMatch(jargon);
    expect(desc).not.toBe(STATUS_DESCRIPTIONS.rilasciata);
  });

  it('overrides every commercio status whose shared copy names titolo/lavori/intervento', () => {
    for (const status of ['rilasciata', 'rilasciata_con_prescrizioni', 'diniegata', 'decaduta']) {
      const desc = statusDescriptionFor(status, 'commercio');
      expect(desc, status).toBeDefined();
      expect(desc, status).not.toMatch(jargon);
    }
  });

  it('falls back to the shared caption for commercio statuses that are already generic', () => {
    for (const status of ['in_attesa', 'concluso', 'annullata', 'archiviata', 'rinunciata']) {
      expect(statusDescriptionFor(status, 'commercio')).toBe(STATUS_DESCRIPTIONS[status]);
    }
  });

  it('leaves the edilizia caption untouched (uses the shared map)', () => {
    expect(statusDescriptionFor('rilasciata', 'edilizia')).toBe(STATUS_DESCRIPTIONS.rilasciata);
  });

  it('uses the shared caption for the already-correct cantieri/eventi statuses', () => {
    expect(statusDescriptionFor('in_corso', 'cantieri')).toBe(STATUS_DESCRIPTIONS.in_corso);
    expect(statusDescriptionFor('in_programma', 'eventi')).toBe(STATUS_DESCRIPTIONS.in_programma);
  });

  // A cantiere is a roadwork site, not a `pratica`, so the shared `concluso` caption
  // ("L’iter della pratica si è concluso") names the wrong domain noun — the same
  // mismatch the "Concluso" label override fixes for the pill. It gets a cantiere-
  // worded caption; commercio's `concluso` (a real pratica) keeps the shared copy.
  it('gives cantieri "concluso" a cantiere-worded caption, not the "pratica" one', () => {
    const desc = statusDescriptionFor('concluso', 'cantieri');
    expect(desc).toBeDefined();
    expect(desc).toMatch(/cantiere/i);
    expect(desc).not.toMatch(/pratica/i);
    expect(desc).not.toBe(STATUS_DESCRIPTIONS.concluso);
  });

  it('leaves commercio "concluso" on the shared caption (a commercio filing is a pratica)', () => {
    expect(statusDescriptionFor('concluso', 'commercio')).toBe(STATUS_DESCRIPTIONS.concluso);
  });

  it('yields undefined for altro/unknown so the UI renders no caption', () => {
    expect(statusDescriptionFor('altro', 'commercio')).toBeUndefined();
    expect(statusDescriptionFor('altro', 'edilizia')).toBeUndefined();
    expect(statusDescriptionFor('not_a_real_status', 'commercio')).toBeUndefined();
  });

  // Segnalazioni carry a constant `altro` status (the dataset has no outcome field),
  // so — unlike edilizia's catch-all `altro` — it gets a category-specific caption
  // rather than none, keeping the segnalazione hero from ending at a bare pill.
  it('gives segnalazioni altro an honest caption (not the empty edilizia catch-all)', () => {
    const desc = statusDescriptionFor('altro', 'segnalazioni');
    expect(desc).toBeDefined();
    expect(desc).toMatch(/segnalazione/i);
  });
});
