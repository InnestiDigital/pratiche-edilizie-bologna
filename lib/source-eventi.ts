import { z } from 'zod';
import { makePageParser, optNull, type ParsedPage } from './schemas';
import { normalizeQuartiere } from './quartiere-normalize';
import { SOURCES } from './sources';
import {
  compactExtra,
  coordsToExtra,
  geoPointSchema,
  nullIfEmpty,
  portalTableSearchLink,
  toIsoDate,
} from './source-shared';
import type { NormalizedPermit } from './normalize';

/**
 * `eventi-bologna-agenda-cultura` — Comune di Bologna cultural-events agenda.
 * ~30k rows total, but this is a FORWARD-looking feed: it is swept with a
 * `future-window` `where` (`start >= today − lookBackDays`), so only currently-
 * relevant and near-future events are fetched (a live probe returned ~560 future
 * rows — comfortably under the `MAX_OFFSET` cap, so a single plain walk suffices).
 * See `SOURCES.eventi.sweep`.
 *
 * The `SOURCES.eventi` registry entry (data-only) owns this source's category /
 * `filing_type` token / slug / sweep; this module owns its zod schema + parser +
 * normalizer, and `source-runtime.ts` (added by the sync-orchestration step) pairs
 * the two — this module is not yet wired into `sync.ts`.
 */

/**
 * One `eventi-bologna-agenda-cultura` row. `id` (the stable, dataset-prefixed
 * source id) and `title` (the card headline — a title-less event carries no
 * information) are required; a row missing either is skipped by the per-row
 * parser. `id` is tolerated as a string or a number (coerced to string), matching
 * the edilizia `richiesta_anno_prot` numeric-tolerance pattern. Every other
 * consumed field is nullable (`optNull`); unknown fields (geo point, bolognaestate,
 * area_metropolitana, area_statistica, …) pass through untouched.
 *
 * A live probe confirmed absent fields serialize as JSON `null` (not the Python
 * `str(None)` literal `'None'`), so no `'None'`→null transform is applied.
 */
export const eventoRowSchema = z
  .object({
    id: z.union([z.string(), z.number().transform((n) => String(n))]),
    title: z.string().min(1),
    description: optNull(z.string()),
    url: optNull(z.string()),
    address: optNull(z.string()),
    start: optNull(z.string()),
    end: optNull(z.string()),
    date_multiple: optNull(z.string()),
    online: optNull(z.string()),
    quartiere: optNull(z.string()),
    categories_1: optNull(z.string()),
    categories_2: optNull(z.string()),
    categories_3: optNull(z.string()),
    zona_di_prossimita: optNull(z.string()),
    // Event venue geo-point `{ lon, lat }` — extracted into `extra` for the P4
    // map; absent/malformed points normalize to null (see coordsToExtra).
    coordinate: optNull(geoPointSchema),
  })
  .passthrough();

export type EventoRow = z.output<typeof eventoRowSchema>;

/** Ingress parser for an eventi page (shared envelope + skip logic). */
export const parseEventiPage: (payload: unknown) => ParsedPage<EventoRow> =
  makePageParser(eventoRowSchema);

export function normalizeEvento(raw: EventoRow): NormalizedPermit {
  // The three `categories_*` slots are this source's genuine tags (the only one
  // with real tag data). Drop absent ones, normalize to lowercase-trimmed keys;
  // TAG_LABELS already falls back to the raw string for unknown keys, so no
  // label-map growth is needed.
  const tags = [raw.categories_1, raw.categories_2, raw.categories_3]
    .filter((t): t is string => t != null)
    .map((t) => t.trim().toLowerCase());
  const coords = coordsToExtra(raw.coordinate);

  return {
    dataset: 'eventi',
    source_id: `eventi-${raw.id}`,
    filing_type: SOURCES.eventi.filingTypeToken, // 'EVENTO'
    category: SOURCES.eventi.category, // 'eventi'
    // An event's `start` is a FUTURE date, so it must NOT go in source_updated_at
    // (the request date the default `request_newest` sort ranks on) — that made
    // every future event outrank every newly issued permit. Events carry no request
    // date: source_updated_at is NULL and the feed sorts them by discovery date
    // (see REQUEST_DATE_SQL in build-feed-query.ts); `start` is preserved in `extra`
    // for the card. Closing date = event end.
    source_updated_at: null,
    date_issued: toIsoDate(raw.end),
    address: raw.address,
    zone: normalizeQuartiere(raw.quartiere),
    codvia: null,
    procedimento: null,
    // Constant status — NOT time-derived: a stored status must not go stale as the
    // event date passes. STATUS_LABELS gains 'in_programma' in the UI step.
    status: 'in_programma',
    status_raw: '',
    tags: JSON.stringify(tags),
    // The culturabologna.it URL is the better destination when present; fall back
    // to a generic portal table search on the stable id otherwise. `nullIfEmpty`
    // guards an empty-string url ('' from the API), which `??` alone would keep as
    // a dead link.
    source_link: nullIfEmpty(raw.url) ?? portalTableSearchLink('eventi', raw.id),
    title: raw.title,
    // Only non-null, non-empty string keys are stored, so the on-device decoder
    // never sees a JSON `null` where it expects an optional string, and an empty
    // string ('' = absent from the API) can't defeat a downstream `??` fallback.
    // Key order is preserved so the serialized `extra` is deterministic (change
    // detection compares it by string equality). `start` — the event's FUTURE
    // start date — is promoted here out of source_updated_at (see the note above).
    extra: compactExtra({
      description: raw.description,
      url: raw.url,
      date_multiple: raw.date_multiple,
      online: raw.online,
      start: toIsoDate(raw.start),
      lat: coords.lat,
      lon: coords.lon,
    }),
  };
}
