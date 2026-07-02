/**
 * Build a maps deep-link for a permit's location so the user can open where the
 * building work is happening in their device's map app (see it on a map / navigate).
 *
 * The permits carry only a free-text `address` (+ optional `zone` quartiere) — no
 * coordinates — so we hand the map app a text query and let it geocode. The city is
 * always appended (`Bologna, Italia`) to anchor the search: every permit in this app
 * is in the Comune di Bologna, and a bare street name like `Via Marconi 24` is
 * ambiguous nationwide.
 *
 * Platform-appropriate target:
 *  - iOS   -> Apple Maps (`http://maps.apple.com/?q=...`), the native handler.
 *  - other -> Google Maps universal search URL, which opens the Google Maps app on
 *             Android and the web map elsewhere.
 *
 * Pure + never throws. Returns `null` when there is no address to search for, so the
 * caller can hide the action rather than open an empty map.
 */

export type MapsPlatform = 'ios' | 'android' | 'web' | (string & {});

/**
 * The geocoder query string for a permit: `<address>, Bologna, Italia`.
 * Returns `null` when the address is missing/blank (nothing to search).
 * `zone` is intentionally omitted — a quartiere name is not part of a postal
 * address and tends to confuse geocoders; the city anchor is what disambiguates.
 */
export function buildMapsQuery(address: string | null | undefined): string | null {
  const street = (address ?? '').trim();
  if (!street) return null;
  return `${street}, Bologna, Italia`;
}

/**
 * The full maps URL to hand to `Linking.openURL`, or `null` when there is no address.
 */
export function buildMapsUrl(
  address: string | null | undefined,
  platform: MapsPlatform
): string | null {
  const query = buildMapsQuery(address);
  if (query === null) return null;
  const encoded = encodeURIComponent(query);
  if (platform === 'ios') {
    return `http://maps.apple.com/?q=${encoded}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
