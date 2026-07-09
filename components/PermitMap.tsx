import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRouter } from 'expo-router';
import type { MapPin, MapRegion, HomeMarker } from '../lib/map-pins';

/** Brand wine-red — the home anchor + radius ring color (distinct from every category dot). */
const HOME_COLOR = '#9B2335';

/**
 * Native map surface for the P4 map view (docs/P4-map-radius.md §5 slice 5).
 *
 * iOS renders Apple Maps via `PROVIDER_DEFAULT` — no API key, no third-party
 * tracker, matching the app's no-backend rule. All pin math lives in the pure,
 * unit-tested `lib/map-pins.ts`; this component is the thin native shell that
 * draws the markers and routes a tap to the permit detail. When a home anchor is
 * set it also draws the "vicino a casa" radius as a metric `<Circle>` plus a
 * distinct home marker, so the map mirrors the feed's place-awareness.
 *
 * A web sibling (`PermitMap.web.tsx`) renders a static placeholder instead — the
 * `react-native-maps` native view cannot mount in the web screenshot export, so
 * the import here is web-shimmed exactly like `lib/db.web.ts` et al.
 */
export function PermitMap({
  pins,
  region,
  home,
}: {
  pins: MapPin[];
  region: MapRegion;
  home?: HomeMarker | null;
}) {
  const router = useRouter();
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      showsUserLocation={false}
      toolbarEnabled={false}>
      {home && (
        <Circle
          center={{ latitude: home.lat, longitude: home.lon }}
          radius={home.radiusMeters}
          strokeColor="rgba(155,35,53,0.9)"
          fillColor="rgba(155,35,53,0.12)"
          strokeWidth={2}
        />
      )}
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          coordinate={{ latitude: pin.lat, longitude: pin.lon }}
          pinColor={pin.color}
          title={pin.title}
          description={pin.subtitle ?? undefined}
          onCalloutPress={() => router.push(`/permit/${pin.id}`)}
        />
      ))}
      {home && (
        <Marker
          coordinate={{ latitude: home.lat, longitude: home.lon }}
          title="Casa"
          description={home.label}
          anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.homeDot}>
            <Text style={styles.homeGlyph}>🏠</Text>
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  homeDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: HOME_COLOR,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeGlyph: {
    fontSize: 14,
    lineHeight: 18,
  },
});
