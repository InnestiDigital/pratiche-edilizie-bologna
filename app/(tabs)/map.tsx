import { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import {
  STATIC_LAYERS,
  STATIC_LAYER_IDS,
  type StaticLayerId,
  type StaticMarker,
} from '../../lib/static-layers';
import { fetchStaticLayer } from '../../lib/static-layer-sync';

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
  const router = useRouter();

  // Static context layers (farmacie, …): MAP-ONLY, default OFF, and independent of
  // the feed/notifications. `activeLayers` is which are toggled on; `layerCache`
  // holds each layer's markers so a re-toggle never refetches (they are inert
  // reference data — downloaded once per session, not persisted); `loadingLayers`
  // drives the per-chip spinner while the first fetch is in flight.
  const [activeLayers, setActiveLayers] = useState<Set<StaticLayerId>>(new Set());
  const [layerCache, setLayerCache] = useState<Partial<Record<StaticLayerId, StaticMarker[]>>>({});
  const [loadingLayers, setLoadingLayers] = useState<Set<StaticLayerId>>(new Set());

  const toggleLayer = useCallback(
    (id: StaticLayerId) => {
      const willActivate = !activeLayers.has(id);
      // Off is instant; on adds the id. The fetch side-effect lives OUTSIDE this
      // pure updater (a state updater must not spawn requests — StrictMode would
      // double-invoke it and fire two fetches).
      setActiveLayers((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      // Fetch on first activation only, and never while one is already in flight;
      // a cached layer re-shows immediately with no refetch.
      if (willActivate && layerCache[id] === undefined && !loadingLayers.has(id)) {
        setLoadingLayers((l) => new Set(l).add(id));
        fetchStaticLayer(id)
          .then((markers) => setLayerCache((c) => ({ ...c, [id]: markers })))
          .catch(() => {
            // Best-effort: a failed fetch must never crash the map. Drop the layer
            // back to OFF and leave it UNCACHED (undefined) so a re-toggle retries.
            setActiveLayers((a) => {
              const rolled = new Set(a);
              rolled.delete(id);
              return rolled;
            });
          })
          .finally(() =>
            setLoadingLayers((l) => {
              const done = new Set(l);
              done.delete(id);
              return done;
            })
          );
      }
    },
    [activeLayers, layerCache, loadingLayers]
  );

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
  // The active static-layer ids in registry order, and their combined markers.
  const activeLayerIds = STATIC_LAYER_IDS.filter((id) => activeLayers.has(id));
  const activeStaticMarkers: StaticMarker[] = activeLayerIds.flatMap((id) => layerCache[id] ?? []);
  // Show the map whenever there is anything to place — pins, the home anchor
  // (its radius ring draws even before any nearby row is geocoded), or an active
  // static overlay (so a toggled layer has a surface even on a sparse map).
  const hasMap = data.pins.length > 0 || data.home !== null || activeStaticMarkers.length > 0;
  const hasLegend = presentCategories.length > 0 || data.home !== null || activeLayerIds.length > 0;

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
          {/* Route the user to Aggiorna — both empty branches point there, so give
              the same actionable CTA the feed's EmptyDataState carries instead of a
              dead-end instruction to find the tab themselves. */}
          <Pressable
            onPress={() => router.push('/(tabs)/sync')}
            accessibilityRole="button"
            accessibilityLabel="Vai ad Aggiorna"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 20,
              backgroundColor: '#9B2335',
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 20,
            }}>
            <Ionicons name="cloud-download-outline" size={16} color="white" />
            <Text style={{ color: 'white', fontWeight: '700', marginLeft: 8 }}>
              Vai ad Aggiorna
            </Text>
          </Pressable>
        </View>
      ) : (
        <PermitMap
          pins={data.pins}
          region={data.region}
          home={data.home}
          staticMarkers={activeStaticMarkers}
        />
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
          {/* The legend is a fixed, small set (home + up to 5 categories) — wrap
              it across lines so every item is always visible at a glance. A
              horizontal-scroll legend hides items a still frame can never reveal;
              legends benefit from being seen in full. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: 16,
              rowGap: 8,
            }}>
            {data.home !== null && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
            {/* Separate the home anchor from the data categories so the wine-red
                "Casa" chip doesn't read as a sixth permit category — it's the
                user's reference point, not a data layer. */}
            {data.home !== null && presentCategories.length > 0 && (
              <View
                style={{
                  width: 1,
                  height: 14,
                  backgroundColor: '#d8cdbd',
                }}
              />
            )}
            {presentCategories.map((c) => (
              <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
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
            {/* Divider before the static layers: they are context overlays, not
                permit categories, so a squared swatch (matching their squared map
                marker) keeps the distinction legible in the legend too. */}
            {activeLayerIds.length > 0 && (presentCategories.length > 0 || data.home !== null) && (
              <View style={{ width: 1, height: 14, backgroundColor: '#d8cdbd' }} />
            )}
            {activeLayerIds.map((id) => (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    backgroundColor: STATIC_LAYERS[id].color,
                    marginRight: 6,
                  }}
                />
                <Text style={{ color: '#4b4238', fontSize: 13, fontWeight: '600' }}>
                  {STATIC_LAYERS[id].label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Static-layer toggles — MAP-ONLY context overlays (farmacie, …), default
          OFF. Always reachable (even on an empty map, so a user can bring up a
          layer with no synced permits); toggling one NEVER touches the feed or
          notifications. Sits above the coverage chip. */}
      <View
        style={{
          position: 'absolute',
          bottom: 52,
          left: 12,
          right: 12,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        }}>
        {STATIC_LAYER_IDS.map((id) => {
          const layer = STATIC_LAYERS[id];
          const isActive = activeLayers.has(id);
          const isLoading = loadingLayers.has(id);
          return (
            <Pressable
              key={id}
              onPress={() => toggleLayer(id)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`Layer ${layer.label}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: isActive ? layer.color : 'rgba(255,255,255,0.92)',
                borderColor: isActive ? layer.color : '#e2d9cd',
              }}>
              {isLoading ? (
                <ActivityIndicator size="small" color={isActive ? '#ffffff' : layer.color} />
              ) : (
                <Ionicons
                  name={layer.ionicon}
                  size={15}
                  color={isActive ? '#ffffff' : layer.color}
                />
              )}
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: 13,
                  fontWeight: '700',
                  color: isActive ? '#ffffff' : '#4b4238',
                }}>
                {layer.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
