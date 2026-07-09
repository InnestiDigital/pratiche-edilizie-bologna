import { useState } from 'react';
import { View, Text, Pressable, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { homeCircleFraction, type MapPin, type MapRegion, type HomeMarker } from '../lib/map-pins';

/** Brand wine-red — matches the native home marker + radius ring. */
const HOME_COLOR = '#9B2335';

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
  // Measured container size (px). We project into pixels rather than percentages so
  // the home radius can render as a TRUE circle: sizing it as `w%`-of-width ×
  // `h%`-of-height stretched it into a vertical pill on the tall phone viewport.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const minLat = region.latitude - region.latitudeDelta / 2;
  const minLon = region.longitude - region.longitudeDelta / 2;

  const clamp = (v: number) => Math.min(0.94, Math.max(0.06, v));
  const project = (lat: number, lon: number): { left: number; top: number } => {
    const x = (lon - minLon) / region.longitudeDelta;
    const y = 1 - (lat - minLat) / region.latitudeDelta; // higher lat → nearer top
    return { left: clamp(x) * (size?.w ?? 0), top: clamp(y) * (size?.h ?? 0) };
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f0ece3', overflow: 'hidden' }} onLayout={onLayout}>
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
      {/* Home radius ring — a TRUE circle centered on the home pin. Its diameter is
          the metric radius mapped to pixels: the region's two axes stretch to fill
          the container unequally, so we average the horizontal and vertical pixel
          extents of the radius and draw one round ring (the native map draws a real
          metric <Circle>; this schematic just needs to read as "raggio da casa",
          not as a stretched pill). Only drawn once the container is measured. */}
      {home &&
        size &&
        (() => {
          const c = project(home.lat, home.lon);
          const { widthFrac, heightFrac } = homeCircleFraction(home, region);
          const wPx = Math.min(1.6, widthFrac) * size.w;
          const hPx = Math.min(1.6, heightFrac) * size.h;
          const d = (wPx + hPx) / 2; // one diameter → circle, not ellipse
          return (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: c.left - d / 2,
                top: c.top - d / 2,
                width: d,
                height: d,
                borderRadius: d / 2,
                borderWidth: 2,
                borderColor: 'rgba(155,35,53,0.75)',
                backgroundColor: 'rgba(155,35,53,0.10)',
              }}
            />
          );
        })()}
      {size &&
        pins.map((pin) => {
          const pos = project(pin.lat, pin.lon);
          return (
            <Pressable
              key={pin.id}
              onPress={() => router.push(`/permit/${pin.id}`)}
              style={{
                position: 'absolute',
                left: pos.left - 7,
                top: pos.top - 7,
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
      {/* Home marker — a distinct brand dot with a house glyph, over the pins. */}
      {home &&
        size &&
        (() => {
          const pos = project(home.lat, home.lon);
          return (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: pos.left - 14,
                top: pos.top - 14,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: HOME_COLOR,
                borderWidth: 2,
                borderColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ fontSize: 14 }}>🏠</Text>
            </View>
          );
        })()}
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
