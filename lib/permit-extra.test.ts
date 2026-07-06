import { describe, it, expect } from 'vitest';
import {
  getCantiereExtra,
  getCommercioExtra,
  getCoords,
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

describe('permit-extra — getCoords', () => {
  it('decodes stored lat/lon strings back into numbers', () => {
    expect(getCoords(JSON.stringify({ lat: '44.4949', lon: '11.3426' }))).toEqual({
      lat: 44.4949,
      lon: 11.3426,
    });
  });

  it('ignores unrelated extra keys and reads only lat/lon', () => {
    const raw = JSON.stringify({ trafficchangesmeasure: 'Divieto', lat: '44.5', lon: '11.3' });
    expect(getCoords(raw)).toEqual({ lat: 44.5, lon: 11.3 });
  });

  it('returns null when one or both coordinates are absent', () => {
    expect(getCoords(JSON.stringify({ lat: '44.5' }))).toBeNull();
    expect(getCoords('{}')).toBeNull();
    expect(getCoords(JSON.stringify({ area: 'Somministrazione' }))).toBeNull();
  });

  it('returns null for a blank string (Number("") is 0 — the blank guard)', () => {
    expect(getCoords(JSON.stringify({ lat: '', lon: '11.3' }))).toBeNull();
    expect(getCoords(JSON.stringify({ lat: '  ', lon: '11.3' }))).toBeNull();
  });

  it('returns null for non-numeric or out-of-range stored values', () => {
    expect(getCoords(JSON.stringify({ lat: 'abc', lon: '11.3' }))).toBeNull();
    expect(getCoords(JSON.stringify({ lat: '91', lon: '11.3' }))).toBeNull();
    expect(getCoords(JSON.stringify({ lat: '44.5', lon: '181' }))).toBeNull();
  });

  it('never throws on corrupt JSON — collapses to null', () => {
    expect(getCoords('not json')).toBeNull();
    expect(getCoords('[1,2]')).toBeNull();
  });
});
