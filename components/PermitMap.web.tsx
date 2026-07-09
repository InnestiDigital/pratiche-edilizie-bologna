import { View, Text, Pressable, type DimensionValue } from 'react-native';
import { useRouter } from 'expo-router';
import type { MapPin, MapRegion } from '../lib/map-pins';

/**
 * Web placeholder for {@link PermitMap} (native). The `react-native-maps` view
 * cannot mount in the web screenshot export (no web entry point in the package),
 * so Metro resolves this `.web.tsx` sibling instead — same contract as
 * `lib/db.web.ts` / `lib/sync.web.ts`.
 *
 * Rather than an empty box, it renders a stylized parchment "map" and scatters
 * each pin as a category-colored dot at its normalized position inside the
 * region bounds, so the harness screenshot shows a populated, representative map
 * (docs/P4-map-radius.md §4). Inert on device — never imported from a `.tsx`
 * module; the plain `PermitMap.tsx` is loaded on iOS/Android.
 */
export function PermitMap({ pins, region }: { pins: MapPin[]; region: MapRegion }) {
  const router = useRouter();
  const minLat = region.latitude - region.latitudeDelta / 2;
  const minLon = region.longitude - region.longitudeDelta / 2;

  const norm = (pin: MapPin): { left: DimensionValue; top: DimensionValue } => {
    const x = (pin.lon - minLon) / region.longitudeDelta;
    const y = 1 - (pin.lat - minLat) / region.latitudeDelta; // higher lat → nearer top
    const clamp = (v: number) => Math.min(0.94, Math.max(0.06, v));
    return { left: `${clamp(x) * 100}%`, top: `${clamp(y) * 100}%` };
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f0ece3', overflow: 'hidden' }}>
      {/* faint grid to read as a map plane */}
      {[0.25, 0.5, 0.75].map((f) => (
        <View
          key={`h${f}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${f * 100}%`,
            height: 1,
            backgroundColor: '#e2d9cd',
          }}
        />
      ))}
      {[0.25, 0.5, 0.75].map((f) => (
        <View
          key={`v${f}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${f * 100}%`,
            width: 1,
            backgroundColor: '#e2d9cd',
          }}
        />
      ))}
      {pins.map((pin) => {
        const pos = norm(pin);
        return (
          <Pressable
            key={pin.id}
            onPress={() => router.push(`/permit/${pin.id}`)}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              marginLeft: -7,
              marginTop: -7,
            }}>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: pin.color,
                borderWidth: 2,
                borderColor: '#ffffff',
              }}
            />
          </Pressable>
        );
      })}
      {/* Placeholder badge, bottom-RIGHT so it clears the screen's coverage chip
          (bottom-left). Web-only; the native map shows no such badge. */}
      <View
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          backgroundColor: 'rgba(255,255,255,0.85)',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
        }}>
        <Text style={{ color: '#6b5f52', fontSize: 12 }}>Anteprima mappa (solo web)</Text>
      </View>
    </View>
  );
}
