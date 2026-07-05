import { describe, it, expect } from 'vitest';
import { eventoRowSchema, parseEventiPage, normalizeEvento, type EventoRow } from './source-eventi';
import { SyncIngressError } from './schemas';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '467834',
    title: 'Una biblioteca in ospedale 2024-2025',
    description: 'Un progetto di lettura in corsia.',
    url: 'https://culturabologna.it/events/467834',
    address: 'L.go Bartolo Nigrisoli, 2, 40133 Bologna BO',
    categories_1: 'incontri',
    categories_2: null,
    categories_3: null,
    online: 'NO',
    start: '2024-09-27',
    end: '2025-02-13',
    date_multiple: null,
    quartiere: 'Porto - Saragozza',
    zona_di_prossimita: 'SARAGOZZA - SAN LUCA',
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}): EventoRow {
  return eventoRowSchema.parse(rawRow(overrides));
}

describe('eventoRowSchema', () => {
  it('accepts a well-formed row and normalizes absent fields to null', () => {
    const r = eventoRowSchema.parse({ id: '1', title: 'Concerto' });
    expect(r.id).toBe('1');
    expect(r.title).toBe('Concerto');
    expect(r.description).toBeNull();
    expect(r.url).toBeNull();
    expect(r.start).toBeNull();
    expect(r.categories_1).toBeNull();
    expect(r.quartiere).toBeNull();
  });

  it('coerces a numeric id to a string', () => {
    expect(parse({ id: 467834 }).id).toBe('467834');
  });

  it('rejects a row without an id or without a title', () => {
    expect(eventoRowSchema.safeParse({ title: 'No id' }).success).toBe(false);
    expect(eventoRowSchema.safeParse({ id: '1' }).success).toBe(false);
    // An empty title carries no information — rejected too.
    expect(eventoRowSchema.safeParse({ id: '1', title: '' }).success).toBe(false);
  });

  it('preserves unknown passthrough fields', () => {
    const r = eventoRowSchema.parse(rawRow({ bolognaestate: 'X' })) as Record<string, unknown>;
    expect(r.bolognaestate).toBe('X');
  });
});

describe('parseEventiPage', () => {
  it('parses a page and skips rows without id/title', () => {
    const page = parseEventiPage({
      total_count: 2,
      results: [rawRow(), { description: 'orphan, no id/title' }],
    });
    expect(page.results).toHaveLength(1);
    expect(page.skipped).toBe(1);
    expect(page.results[0].id).toBe('467834');
  });

  it('throws SyncIngressError when a page has rows but none survive', () => {
    expect(() => parseEventiPage({ total_count: 5, results: [{ nope: true }] })).toThrow(
      SyncIngressError
    );
  });

  it('does not throw on a genuinely empty page', () => {
    expect(parseEventiPage({ total_count: 0, results: [] }).results).toEqual([]);
  });
});

describe('normalizeEvento', () => {
  it('maps every field to the normalized permit shape', () => {
    const n = normalizeEvento(parse());
    expect(n.dataset).toBe('eventi');
    expect(n.source_id).toBe('eventi-467834');
    expect(n.filing_type).toBe('EVENTO');
    expect(n.category).toBe('eventi');
    expect(n.title).toBe('Una biblioteca in ospedale 2024-2025');
    expect(n.address).toBe('L.go Bartolo Nigrisoli, 2, 40133 Bologna BO');
    expect(n.zone).toBe('Porto-Saragozza');
    expect(n.codvia).toBeNull();
    expect(n.procedimento).toBeNull();
    // Events carry no request date: source_updated_at is always NULL (the future
    // start date lives in `extra.start`, see below). Closing date = event end.
    expect(n.source_updated_at).toBeNull();
    expect(n.date_issued).toBe('2025-02-13');
  });

  it('uses a constant "in_programma" status (never time-derived)', () => {
    expect(normalizeEvento(parse()).status).toBe('in_programma');
    expect(normalizeEvento(parse()).status_raw).toBe('');
    // Even for an event whose start is far in the past, status stays constant.
    expect(normalizeEvento(parse({ start: '2010-01-01' })).status).toBe('in_programma');
  });

  it('derives tags from categories_1-3, dropping absent ones and lowercasing', () => {
    expect(JSON.parse(normalizeEvento(parse()).tags)).toEqual(['incontri']);
    expect(
      JSON.parse(
        normalizeEvento(
          parse({ categories_1: 'Incontri', categories_2: ' Mostre ', categories_3: 'Musica' })
        ).tags
      )
    ).toEqual(['incontri', 'mostre', 'musica']);
    expect(
      JSON.parse(
        normalizeEvento(parse({ categories_1: null, categories_2: null, categories_3: null })).tags
      )
    ).toEqual([]);
  });

  it('prefers the culturabologna.it url as the source link, falling back to the portal', () => {
    expect(normalizeEvento(parse()).source_link).toBe('https://culturabologna.it/events/467834');
    expect(normalizeEvento(parse({ url: null })).source_link).toBe(
      'https://opendata.comune.bologna.it/explore/dataset/eventi-bologna-agenda-cultura/table/?q=467834'
    );
  });

  it('treats an empty-string url as absent for the source link (finding 6)', () => {
    // `??` only guards null/undefined; an empty-string url must still fall back to
    // the portal search, not produce a dead link.
    expect(normalizeEvento(parse({ url: '' })).source_link).toBe(
      'https://opendata.comune.bologna.it/explore/dataset/eventi-bologna-agenda-cultura/table/?q=467834'
    );
    // …and it is not stored in `extra` either.
    expect(JSON.parse(normalizeEvento(parse({ url: '' })).extra).url).toBeUndefined();
  });

  it('stores only non-null, non-empty extra keys (description/url/date_multiple/online/start)', () => {
    expect(JSON.parse(normalizeEvento(parse()).extra)).toEqual({
      description: 'Un progetto di lettura in corsia.',
      url: 'https://culturabologna.it/events/467834',
      online: 'NO',
      // The event start date is promoted into `extra` (source_updated_at is NULL).
      start: '2024-09-27',
    });
    expect(
      JSON.parse(
        normalizeEvento(
          parse({ description: null, url: null, date_multiple: null, online: null, start: null })
        ).extra
      )
    ).toEqual({});
    expect(
      JSON.parse(normalizeEvento(parse({ date_multiple: '2024-09-27,2024-09-28' })).extra)
    ).toMatchObject({ date_multiple: '2024-09-27,2024-09-28' });
  });

  it('leaves source_updated_at NULL and stores the sliced start date in extra', () => {
    // The event start is a FUTURE date, so it must not sit in source_updated_at (the
    // request-date column the default sort ranks on); it is sliced to YYYY-MM-DD and
    // kept in `extra.start`. The end date remains the closing date.
    const n = normalizeEvento(parse({ start: '2024-09-27T20:00:00+00:00' }));
    expect(n.source_updated_at).toBeNull();
    expect(JSON.parse(n.extra).start).toBe('2024-09-27');
    const absent = normalizeEvento(parse({ start: null, end: null }));
    expect(absent.source_updated_at).toBeNull();
    expect(absent.date_issued).toBeNull();
    expect(JSON.parse(absent.extra).start).toBeUndefined();
  });

  it('maps an unknown quartiere to null', () => {
    expect(normalizeEvento(parse({ quartiere: 'Nowhere' })).zone).toBeNull();
  });
});
