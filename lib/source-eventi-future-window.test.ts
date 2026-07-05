import { describe, it, expect } from 'vitest';
import { eventoRowSchema, normalizeEvento, type EventoRow } from './source-eventi';
import { SOURCES } from './sources';
import { buildSinceWhere } from './ods-request';

/**
 * Focused coverage for the `eventi-bologna-agenda-cultura` source added this
 * session, on top of `source-eventi.test.ts`: schema validation + `source_id`
 * derivation spot-checks, plus the `future-window` sweep-strategy date
 * boundary it declares (`SOURCES.eventi.sweep`).
 *
 * NOTE on the future-window boundary: the actual "today − lookBackDays" clock
 * read lives in the un-exported `sweepFutureWindow` in `lib/sync.ts`
 * (`since.setUTCDate(since.getUTCDate() - lookBackDays)`), which reads
 * `new Date()` directly with no injectable reference-date parameter — unlike
 * `recentYears`/`fullScanYears`/`bisectRange` in `lib/paginate.ts`, which all
 * take an explicit `currentYear`/`year` and are trivially deterministic. That
 * function is also unreachable from a pure test: it is private, and every
 * exported path to it (`syncRecent`/`syncFull`) goes through `getDb()`
 * (native `expo-sqlite`), which this suite must not import. So the boundary
 * computation itself cannot be exercised deterministically as currently
 * structured — see the reported gap below. What CAN be tested here,
 * deterministically, with a fixed reference date (never real "today"), is:
 *  (a) the sweep declares the documented contract (`future-window`, field
 *      `start`, `lookBackDays: 7`), and
 *  (b) the pure `where`-clause formatter (`buildSinceWhere`, the function
 *      `sweepFutureWindow` delegates to) produces the exact ODS-QL boundary
 *      for the date `sweepFutureWindow`'s documented algorithm would compute
 *      from a fixed reference date.
 */

describe('SOURCES.eventi future-window sweep contract', () => {
  it('declares a future-window sweep on the "start" field with a 7-day look-back', () => {
    expect(SOURCES.eventi.sweep).toEqual({
      kind: 'future-window',
      field: 'start',
      lookBackDays: 7,
    });
  });
});

describe('future-window date boundary (fixed reference date, not real "today")', () => {
  // Mirrors sweepFutureWindow's documented algorithm exactly:
  //   since = referenceDate; since.setUTCDate(since.getUTCDate() - lookBackDays)
  // computed here against a fixed literal reference date so the test never
  // depends on the real clock.
  function sinceIsoDate(referenceDateIso: string, lookBackDays: number): string {
    const since = new Date(`${referenceDateIso}T00:00:00.000Z`);
    since.setUTCDate(since.getUTCDate() - lookBackDays);
    return since.toISOString().slice(0, 10);
  }

  it('subtracts lookBackDays (7) from a fixed reference date to the exact expected day', () => {
    // Fixed reference date — NOT `new Date()` / real today.
    const referenceDate = '2026-07-05';
    expect(sinceIsoDate(referenceDate, SOURCES.eventi.sweep.lookBackDays as number)).toBe(
      '2026-06-28'
    );
  });

  it('crosses a month/year boundary correctly (reference date near year start)', () => {
    expect(sinceIsoDate('2026-01-03', 7)).toBe('2025-12-27');
  });

  it('builds the exact ODS-QL where clause for the computed boundary via buildSinceWhere', () => {
    const boundary = sinceIsoDate('2026-07-05', SOURCES.eventi.sweep.lookBackDays as number);
    expect(buildSinceWhere(SOURCES.eventi.sweep.field as string, boundary)).toBe(
      "start>=date'2026-06-28'"
    );
  });
});

describe('eventoRowSchema (spot checks)', () => {
  it('accepts a minimal valid row (id + title only) and nulls out everything else', () => {
    const r = eventoRowSchema.parse({ id: '42', title: 'Mostra fotografica' });
    expect(r).toMatchObject({
      id: '42',
      title: 'Mostra fotografica',
      description: null,
      url: null,
      start: null,
      end: null,
      quartiere: null,
      categories_1: null,
      categories_2: null,
      categories_3: null,
    });
  });

  it('rejects a row missing id or title', () => {
    expect(eventoRowSchema.safeParse({ title: 'Senza id' }).success).toBe(false);
    expect(eventoRowSchema.safeParse({ id: '42' }).success).toBe(false);
  });
});

describe('normalizeEvento source_id', () => {
  function row(overrides: Partial<EventoRow> = {}): EventoRow {
    return eventoRowSchema.parse({ id: '467834', title: 'Concerto', ...overrides });
  }

  it('derives source_id as "eventi-<id>" from the raw id field', () => {
    expect(normalizeEvento(row()).source_id).toBe('eventi-467834');
  });

  it('derives source_id from a numeric-looking id coerced to string by the schema', () => {
    const parsed = eventoRowSchema.parse({ id: 99, title: 'Evento numerico' });
    expect(normalizeEvento(parsed).source_id).toBe('eventi-99');
  });
});
