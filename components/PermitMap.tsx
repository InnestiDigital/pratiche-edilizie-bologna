import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRouter } from 'expo-router';
import type { MapPin, MapRegion } from '../lib/map-pins';

/**
 * Native map surface for the P4 map view (docs/P4-map-radius.md §5 slice 5).
 *
 * iOS renders Apple Maps via `PROVIDER_DEFAULT` — no API key, no third-party
 * tracker, matching the app's no-backend rule. All pin math lives in the pure,
 * unit-tested `lib/map-pins.ts`; this component is the thin native shell that
 * draws the markers and routes a tap to the permit detail.
 *
 * A web sibling (`PermitMap.web.tsx`) renders a static placeholder instead — the
 * `react-native-maps` native view cannot mount in the web screenshot export, so
 * the import here is web-shimmed exactly like `lib/db.web.ts` et al.
 */
export function PermitMap({ pins, region }: { pins: MapPin[]; region: MapRegion }) {
  const router = useRouter();
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      showsUserLocation={false}
      toolbarEnabled={false}>
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
    </MapView>
  );
}
