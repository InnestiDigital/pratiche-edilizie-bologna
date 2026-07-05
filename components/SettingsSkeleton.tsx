import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 6,
  elevation: 2,
} as const;

/** Filled parchment placeholder block standing in for a line of text. */
function Bar({ w, h = 'h-4', className = '' }: { w: string; h?: string; className?: string }) {
  return <View className={`${h} ${w} rounded-md bg-parchment-200 ${className}`} />;
}

/** Placeholder for a "Quartieri"/"Tipo di Pratica" style toggle-row card: N rows
 *  of a leading label block + a trailing pill standing in for the switch. */
function ToggleRowsCard({ rows }: { rows: number }) {
  return (
    <View className="mx-4 overflow-hidden rounded-xl bg-white" style={CARD_SHADOW}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          className={`flex-row items-center px-4 py-4 ${
            i < rows - 1 ? 'border-b border-parchment-200' : ''
          }`}>
          <Bar w="w-40" h="h-4" />
          <View className="flex-1" />
          <View className="h-6 w-11 rounded-full bg-parchment-200" />
        </View>
      ))}
    </View>
  );
}

/**
 * Loading placeholder for the settings screen. Mirrors the real body — the filter
 * match-summary card (funnel circle + number/label), the "Notifiche" toggle card,
 * and a "Quartieri" toggle-rows card — with parchment-toned blocks in place of
 * text, so the screen animates in with its real shape instead of a bare centered
 * "Caricamento…". Shares the same native-driven 700ms pulse as the feed / detail
 * skeletons, keeping one loading language across the app.
 */
export function SettingsSkeleton() {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <View className="flex-1 bg-parchment-100">
      <Animated.View
        style={{ opacity }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Caricamento impostazioni">
        {/* Filter match-summary card (funnel circle + number/label) */}
        <View
          className="mx-4 mt-4 flex-row items-center rounded-2xl bg-white p-5"
          style={CARD_SHADOW}>
          <View className="mr-4 h-12 w-12 rounded-full bg-parchment-200" />
          <View className="flex-1">
            <Bar w="w-24" h="h-6" />
            <Bar w="w-2/3" h="h-3" className="mt-2" />
          </View>
        </View>

        {/* "Notifiche" section header + single-toggle card */}
        <Bar w="w-28" h="h-5" className="mx-4 mb-3 mt-6" />
        <ToggleRowsCard rows={1} />

        {/* "Quartieri" section header + toggle-rows card */}
        <Bar w="w-28" h="h-5" className="mx-4 mb-3 mt-6" />
        <ToggleRowsCard rows={4} />
      </Animated.View>
    </View>
  );
}
