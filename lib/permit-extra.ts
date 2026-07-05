/**
 * Hardened decoder for a permit's `extra` JSON column.
 *
 * `extra` holds the category-specific fields each source's normalizer could not
 * fit into the shared, promoted columns (a cantiere's traffic-change note, an
 * event's URL, a segnalazione's proximity-zone name, …). It is written once at
 * normalize time as `JSON.stringify(Record<string, string>)` with only non-null
 * keys, so on device we expect a flat string→string object.
 *
 * This is our OWN storage boundary, not a network boundary, so it uses defensive
 * type-guard decoding (the `parsePermitTags` pattern) rather than a zod schema:
 * a corrupt / legacy / hand-edited value must never crash a card render, it just
 * collapses to "no extra data". Every accessor returns all-optional string fields.
 */

/**
 * Parse the raw `extra` column into a flat `string → string` record. Any value
 * that is not a JSON object of string values is dropped: invalid JSON, a JSON
 * array/primitive, or a non-string field all yield `{}` / are filtered out,
 * never a throw.
 */
function decodeExtra(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * Pick a fixed set of string keys out of a decoded `extra` object. A shared core
 * for the per-category accessors below (four proven consumers, so not speculative
 * — CLAUDE.md's YAGNI bar): each accessor names exactly the keys its card reads,
 * so an unrelated / stale key stored in `extra` is never surfaced.
 */
function pickExtra<K extends string>(raw: string, keys: readonly K[]): Partial<Record<K, string>> {
  const decoded = decodeExtra(raw);
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = decoded[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Cantieri (`lavori-pubblici`) extra fields. */
export interface CantiereExtra {
  /** Free-text traffic-change measure, e.g. "Divieto di transito veicolare". */
  trafficchangesmeasure?: string;
}

export function getCantiereExtra(raw: string): CantiereExtra {
  return pickExtra(raw, ['trafficchangesmeasure']);
}

/** Commercio (`istanze-commercio`) extra fields. */
export interface CommercioExtra {
  area?: string;
  sottoarea?: string;
  tipo_pratica?: string;
}

export function getCommercioExtra(raw: string): CommercioExtra {
  return pickExtra(raw, ['area', 'sottoarea', 'tipo_pratica']);
}

/** Eventi (`eventi-bologna-agenda-cultura`) extra fields. */
export interface EventoExtra {
  description?: string;
  url?: string;
  date_multiple?: string;
  online?: string;
  /** Event start date `YYYY-MM-DD` — promoted out of source_updated_at, which
   *  events leave NULL (a start is a future date, not a request date). */
  start?: string;
}

export function getEventoExtra(raw: string): EventoExtra {
  return pickExtra(raw, ['description', 'url', 'date_multiple', 'online', 'start']);
}

/** Segnalazioni (CRM) extra fields. */
export interface SegnalazioneExtra {
  sottocategoria_01?: string;
  sottocategoria_02?: string;
  sottocategoria_03?: string;
  /** The only human-readable location this source carries (no address field). */
  nome_zona_prossimita?: string;
}

export function getSegnalazioneExtra(raw: string): SegnalazioneExtra {
  return pickExtra(raw, [
    'sottocategoria_01',
    'sottocategoria_02',
    'sottocategoria_03',
    'nome_zona_prossimita',
  ]);
}
