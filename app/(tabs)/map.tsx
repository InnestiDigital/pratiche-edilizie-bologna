import { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../lib/db';
import { getPermits, type FeedFilters, type Permit } from '../../lib/queries';
import { toMapPins, pinsRegion, type MapPin, type MapRegion } from '../../lib/map-pins';
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORIES, type Category } from '../../lib/sources';
import { PermitMap } from '../../components/PermitMap';

// The map frames every stored permit that carries a coordinate; the synced set
// already respects the user's followed categories (sync skips unfollowed), so an
// empty filter = "everything the user follows". A generous cap keeps the marker
// count bounded without paging — the local DB rarely exceeds this on-device.
const ALL_FILTERS: FeedFilters = { zones: [], filingTypes: [], tags: [] };
const MAP_CAP = 500;

interface MapData {
  pins: MapPin[];
  region: MapRegion;
  withoutCoords: number;
  total: number;
}

export default function MapScreen() {
  const [data, setData] = useState<MapData | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        const permits: Permit[] = await getPermits(db, ALL_FILTERS, MAP_CAP, 0);
        const { pins, withoutCoords } = toMapPins(permits);
        if (!active) return;
        setData({ pins, region: pinsRegion(pins), withoutCoords, total: permits.length });
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

  return (
    <View style={{ flex: 1, backgroundColor: '#f0ece3' }}>
      {data.pins.length === 0 ? (
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
        <PermitMap pins={data.pins} region={data.region} />
      )}

      {/* Legend + coverage — overlaid so it reads over the map without a layout shift */}
      {presentCategories.length > 0 && (
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
          </ScrollView>
        </View>
      )}

      {data.pins.length > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 999,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: '#e2d9cd',
          }}>
          <Text style={{ color: '#6b5f52', fontSize: 12 }}>
            {data.pins.length} sulla mappa
            {data.withoutCoords > 0 ? ` · ${data.withoutCoords} senza posizione` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}
