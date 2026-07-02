import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
  elevation: 2,
} as const;

/**
 * One placeholder card mirroring the PermitCard layout (badge row, address,
 * zone, procedimento, footer) with parchment-toned blocks in place of text.
 */
function SkeletonCard() {
  return (
    <View className="mx-4 mb-2.5 rounded-xl bg-white p-4" style={CARD_SHADOW}>
      {/* Top row: filing badge + status */}
      <View className="mb-3 flex-row items-center">
        <View className="h-6 w-14 rounded-md bg-parchment-200" />
        <View className="ml-2 h-3.5 w-20 rounded-md bg-parchment-200" />
      </View>

      {/* Address */}
      <View className="h-4 w-3/4 rounded-md bg-parchment-200" />

      {/* Zone */}
      <View className="mt-2 h-3 w-2/5 rounded-md bg-parchment-200" />

      {/* Procedimento */}
      <View className="mt-3 h-3 w-full rounded-md bg-parchment-200" />
      <View className="mt-1.5 h-3 w-5/6 rounded-md bg-parchment-200" />

      {/* Footer: date + protocol */}
      <View className="mt-3 flex-row">
        <View className="mr-3 h-3 w-20 rounded-md bg-parchment-200" />
        <View className="h-3 w-24 rounded-md bg-parchment-200" />
      </View>
    </View>
  );
}

/**
 * Loading placeholder for the permit feed: a stack of pulsing skeleton cards
 * shown while the first page loads from SQLite, replacing a bare "Caricamento…"
 * text so the feed animates in with its real layout instead of flashing empty.
 * The whole stack shares a single Animated opacity node (cheap; native-driven).
 */
export function PermitFeedSkeleton({ count = 6 }: { count?: number }) {
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
    <Animated.View
      style={{ opacity }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Caricamento pratiche">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </Animated.View>
  );
}
