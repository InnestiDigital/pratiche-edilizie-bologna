import { describe, it, expect } from 'vitest';
import { permitHeadline, NO_HEADLINE } from './permit-headline';

describe('permitHeadline', () => {
  it('prefers the title (cantieri/commercio/eventi/segnalazioni carry the real name there)', () => {
    expect(
      permitHeadline({ title: 'Apertura somministrazione temporanea', address: 'Via Marconi 24' })
    ).toBe('Apertura somministrazione temporanea');
  });

  it('falls back to the address when there is no title (edilizia)', () => {
    expect(permitHeadline({ title: null, address: 'Via Marconi 24' })).toBe('Via Marconi 24');
  });

  it('a segnalazione (title set, address always null) leads with its report type, not the placeholder', () => {
    // The exact regression: source-segnalazioni stamps address:null, so reading
    // address alone rendered "Indirizzo non disponibile" for every report.
    expect(
      permitHeadline({ title: 'Verde privato · Alberi/rami · Invadenti', address: null })
    ).toBe('Verde privato · Alberi/rami · Invadenti');
  });

  it('returns the placeholder for a title-less AND address-less record', () => {
    expect(permitHeadline({ title: null, address: null })).toBe(NO_HEADLINE);
    expect(permitHeadline({ title: null, address: null })).toBe('Indirizzo non disponibile');
  });

  it('treats a blank/whitespace-only title as absent and uses the address', () => {
    expect(permitHeadline({ title: '   ', address: 'Via Marconi 24' })).toBe('Via Marconi 24');
  });

  it('treats a blank title AND blank address as absent → placeholder', () => {
    expect(permitHeadline({ title: '  ', address: '\t' })).toBe(NO_HEADLINE);
  });

  it('trims surrounding whitespace on the value it keeps', () => {
    expect(permitHeadline({ title: '  Concerto in piazza  ', address: null })).toBe(
      'Concerto in piazza'
    );
  });
});
