import { describe, it, expect } from 'vitest';
import {
  getCantiereExtra,
  getCommercioExtra,
  getEventoExtra,
  getSegnalazioneExtra,
} from './permit-extra';

describe('permit-extra — hardened decoding', () => {
  it('returns {} for the empty-object default written by edilizia rows', () => {
    expect(getCantiereExtra('{}')).toEqual({});
    expect(getCommercioExtra('{}')).toEqual({});
    expect(getEventoExtra('{}')).toEqual({});
    expect(getSegnalazioneExtra('{}')).toEqual({});
  });

  it('never throws on invalid JSON — collapses to {}', () => {
    expect(getCantiereExtra('not json')).toEqual({});
    expect(getEventoExtra('')).toEqual({});
    expect(getCommercioExtra('{ broken')).toEqual({});
  });

  it('ignores a JSON array or primitive (not an object)', () => {
    expect(getEventoExtra('[1,2,3]')).toEqual({});
    expect(getEventoExtra('"a string"')).toEqual({});
    expect(getEventoExtra('42')).toEqual({});
    expect(getEventoExtra('null')).toEqual({});
  });

  it('drops non-string field values', () => {
    expect(
      getCommercioExtra('{"area":"Somministrazione","sottoarea":5,"tipo_pratica":null}')
    ).toEqual({ area: 'Somministrazione' });
  });
});

describe('permit-extra — per-category accessors filter to their own keys', () => {
  it('getCantiereExtra reads only trafficchangesmeasure', () => {
    const raw = JSON.stringify({
      trafficchangesmeasure: 'Divieto di transito veicolare',
      url: 'https://example.org',
    });
    expect(getCantiereExtra(raw)).toEqual({
      trafficchangesmeasure: 'Divieto di transito veicolare',
    });
  });

  it('getCommercioExtra reads area/sottoarea/tipo_pratica', () => {
    const raw = JSON.stringify({
      area: 'Somministrazione',
      sottoarea: 'Bar',
      tipo_pratica: 'Apertura',
      trafficchangesmeasure: 'nope',
    });
    expect(getCommercioExtra(raw)).toEqual({
      area: 'Somministrazione',
      sottoarea: 'Bar',
      tipo_pratica: 'Apertura',
    });
  });

  it('getEventoExtra reads description/url/date_multiple/online', () => {
    const raw = JSON.stringify({
      description: 'Una mostra',
      url: 'https://culturabologna.it/x',
      date_multiple: 'SI',
      online: 'SI',
      area: 'ignored',
    });
    expect(getEventoExtra(raw)).toEqual({
      description: 'Una mostra',
      url: 'https://culturabologna.it/x',
      date_multiple: 'SI',
      online: 'SI',
    });
  });

  it('getSegnalazioneExtra reads the sottocategoria chain + nome_zona_prossimita', () => {
    const raw = JSON.stringify({
      sottocategoria_01: 'Verde privato',
      sottocategoria_02: 'Alberi/rami',
      sottocategoria_03: 'Invadenti',
      nome_zona_prossimita: 'Cirenaica',
      url: 'ignored',
    });
    expect(getSegnalazioneExtra(raw)).toEqual({
      sottocategoria_01: 'Verde privato',
      sottocategoria_02: 'Alberi/rami',
      sottocategoria_03: 'Invadenti',
      nome_zona_prossimita: 'Cirenaica',
    });
  });

  it('omits keys that are absent (partial extra)', () => {
    expect(getSegnalazioneExtra(JSON.stringify({ nome_zona_prossimita: 'Bolognina' }))).toEqual({
      nome_zona_prossimita: 'Bolognina',
    });
  });
});
