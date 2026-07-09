import { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../lib/db';
import { getPermits, type FeedFilters } from '../../lib/queries';
import {
  toMapPins,
  mapViewport,
  describeWithoutCoords,
  type MapPin,
  type MapRegion,
  type HomeMarker,
} from '../../lib/map-pins';
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORIES, type Category } from '../../lib/sources';
import { loadPreferences } from '../../lib/preferences';
import { formatRadiusLabel } from '../../lib/home-location';
import { PermitMap } from '../../components/PermitMap';
import { FadeScrollRow } from '../../components/FadeScrollRow';

/** Brand wine-red — matches the home marker/ring drawn in PermitMap. */
const HOME_COLOR = '#9B2335';

// The map frames every stored permit that carries a coordinate; the synced set
// already respects the user's followed categories (sync skips unfollowed), so an
// empty filter = "everything the user follows". A generous cap keeps the marker
// count bounded without paging — the local DB rarely exceeds this on-device.
const ALL_FILTERS: FeedFilters = { zones: [], filingTypes: [], tags: [] };
const MAP_CAP = 500;

interface MapData {
  pins: MapPin[];
  region: MapRegion;
  home: HomeMarker | null;
  /** Coverage-chip clause naming the coordinate-less rows, or `null` when none. */
  withoutLabel: string | null;
  total: number;
}

export default function MapScreen() {
  const [data, setData] = useState<MapData | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        const [permits, prefs] = await Promise.all([
          getPermits(db, ALL_FILTERS, MAP_CAP, 0),
          loadPreferences(),
        ]);
        const { pins, withoutByCategory } = toMapPins(permits);
        const home: HomeMarker | null = prefs.home
          ? {
              lat: prefs.home.coords.lat,
              lon: prefs.home.coords.lon,
              radiusMeters: prefs.homeRadiusMeters,
              label: prefs.home.label,
            }
          : null;
        if (!active) return;
        setData({
          pins,
          region: mapViewport(pins, home),
          home,
          withoutLabel: describeWithoutCoords(withoutByCategory),
          total: permits.length,
        });
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  if (!data) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0ece3',
        }}>
        <ActivityIndicator color="#9B2335" />
      </View>
    );
  }

  const presentCategories = CATEGORIES.filter((c: Category) =>
    data.pins.some((p) => p.category === c)
  );
  // Show the map whenever there is anything to place — pins OR the home anchor
  // (a set home draws its radius ring even before any nearby row is geocoded).
  const hasMap = data.pins.length > 0 || data.home !== null;
  const hasLegend = presentCategories.length > 0 || data.home !== null;

  return (
    <View style={{ flex: 1, backgroundColor: '#f0ece3' }}>
      {!hasMap ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 40,
          }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🗺️</Text>
          <Text style={{ color: '#4b4238', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
            Nessuna voce da mostrare sulla mappa
          </Text>
          <Text
            style={{
              color: '#8a7f72',
              fontSize: 14,
              textAlign: 'center',
              marginTop: 8,
              lineHeight: 20,
            }}>
            {data.total > 0
              ? 'Le voci sincronizzate non hanno ancora una posizione geografica. Aggiorna i dati per popolare la mappa.'
              : 'Sincronizza i dati dalla scheda Aggiorna per vedere le voci sulla mappa.'}
          </Text>
        </View>
      ) : (
        <PermitMap pins={data.pins} region={data.region} home={data.home} />
      )}

      {/* Legend + coverage — overlaid so it reads over the map without a layout shift */}
      {hasLegend && (
        <View
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 14,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: '#e2d9cd',
          }}>
          <FadeScrollRow>
            {data.home !== null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: HOME_COLOR,
                    marginRight: 6,
                  }}
                />
                <Text style={{ color: '#4b4238', fontSize: 13, fontWeight: '600' }}>Casa</Text>
              </View>
            )}
            {presentCategories.map((c) => (
              <View key={c} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: CATEGORY_COLORS[c].text,
                    marginRight: 6,
                  }}
                />
                <Text style={{ color: '#4b4238', fontSize: 13, fontWeight: '600' }}>
                  {CATEGORY_LABELS[c]}
                </Text>
              </View>
            ))}
          </FadeScrollRow>
        </View>
      )}

      {hasMap && (
        <View
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            // Cap the width so a long coverage string ("N sulla mappa · N
            // pratiche senza posizione · casa 2 km") wraps to two lines instead
            // of running off a narrow phone. Short strings still shrink the pill
            // to content — only the worst case grows and wraps.
            maxWidth: '86%',
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 999,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: '#e2d9cd',
          }}>
          <Text style={{ color: '#6b5f52', fontSize: 12 }}>
            {data.pins.length} sulla mappa
            {data.withoutLabel !== null ? ` · ${data.withoutLabel}` : ''}
            {data.home !== null ? ` · casa ${formatRadiusLabel(data.home.radiusMeters)}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}
