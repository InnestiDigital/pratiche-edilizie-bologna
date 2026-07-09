import { resolveStreetCode, type StreetIndex } from './street-index';
import { buildCiviciIndex, geocodeCivico } from './geocode-civici';
import { planCiviciFetch } from './civici-fetch-plan';
import { defaultCiviciBatchFetcher, type CiviciBatchFetcher } from './civici-sync';
import {
  parseCivicoInput,
  formatHomeAddressLabel,
  type HomeAddressResolution,
} from './home-address';

/**
 * Device orchestration for the Settings "Imposta indirizzo" flow: resolve a
 * picked street + civic number to a home anchor. It composes the already-tested
 * pure cores end to end —
 *
 *   picked street  → `codvia`            ({@link resolveStreetCode})
 *     → cap-safe scoped `where` clause    ({@link planCiviciFetch})
 *     → page the `rifter_civici_pt` gazetteer for that ONE street  (fetchBatch)
 *     → build the lookup                  ({@link buildCiviciIndex})
 *     → `codvia`+`civico` → coordinate    ({@link geocodeCivico})
 *     → home label                        ({@link formatHomeAddressLabel})
 *
 * The ONLY device-gated seam is the live gazetteer fetch, which is INJECTED
 * (`fetchBatch`, defaulting to the real network walker) so the whole branch table
 * — empty index, unknown street, no coordinate, fetch failure, ok — is unit-tested
 * with a fake fetcher and no device. Mirrors `civici-sync.ts`, scoped to a single
 * street instead of every edilizia `codvia`.
 *
 * No external geocoder and no backend (the app's no-network invariant): the
 * coordinate comes only from the downloaded Bologna gazetteer, resolution against
 * the LOCAL street index is normalized-exact, and every failure is explicit —
 * never a nearest-guess that could anchor the wrong home.
 */
export async function resolveAddressToHome(
  streetIndex: StreetIndex,
  via: string,
  civicoRaw: string,
  fetchBatch: CiviciBatchFetcher = defaultCiviciBatchFetcher
): Promise<HomeAddressResolution> {
  if (streetIndex.names.length === 0) return { kind: 'empty-index' };

  const codvia = resolveStreetCode(streetIndex, via);
  if (codvia == null) return { kind: 'unknown-street' };

  const civico = parseCivicoInput(civicoRaw);

  // A single street → exactly one cap-safe batch; fetch only that street's civici.
  const [batch] = planCiviciFetch([codvia]);
  let records;
  try {
    records = batch ? await fetchBatch(batch.where) : [];
  } catch {
    // Offline / transport error: surface it distinctly so the UI can say "retry"
    // rather than "unknown address" — a failed fetch is not a missing street.
    return { kind: 'fetch-failed' };
  }

  const coord = geocodeCivico(buildCiviciIndex(records), codvia, civico);
  if (coord == null) return { kind: 'no-coordinate' };

  return {
    kind: 'ok',
    home: { coords: coord, label: formatHomeAddressLabel(via, civico) },
  };
}
