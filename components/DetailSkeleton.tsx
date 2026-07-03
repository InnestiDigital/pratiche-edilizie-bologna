import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
} as const;

const SOFT_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 1,
} as const;

/** Filled parchment placeholder block standing in for a line of text. */
function Bar({ w, h = 'h-4', className = '' }: { w: string; h?: string; className?: string }) {
  return <View className={`${h} ${w} rounded-md bg-parchment-200 ${className}`} />;
}

/**
 * Loading placeholder for the permit detail screen. Mirrors the real layout —
 * header card (badge, address, zone, protocol, status pill), the "Che cos'è"
 * explainer card, and the Procedimento card — with parchment-toned blocks in
 * place of text, so tapping a feed card animates into the detail's real shape
 * instead of flashing a bare centered "Caricamento…". Shares one native-driven
 * Animated opacity node with the same 700ms pulse as the feed skeleton, keeping
 * the loading language consistent across the app.
 */
export function DetailSkeleton() {
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
        className="p-4"
        style={{ opacity }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Caricamento pratica">
        {/* Header card */}
        <View className="rounded-2xl bg-white p-5" style={CARD_SHADOW}>
          <Bar w="w-40" h="h-7" className="rounded-lg" />
          <Bar w="w-3/4" h="h-6" className="mt-3" />
          <Bar w="w-1/3" h="h-4" className="mt-2.5" />
          <Bar w="w-2/5" h="h-3.5" className="mt-2" />
          <View className="mt-3 h-8 w-32 rounded-full bg-parchment-200" />
        </View>

        {/* Explainer card (icon circle + text) */}
        <View className="mt-3 flex-row rounded-2xl bg-white p-5" style={SOFT_SHADOW}>
          <View className="mr-3 h-9 w-9 rounded-full bg-parchment-200" />
          <View className="flex-1">
            <Bar w="w-12" h="h-3.5" />
            <Bar w="w-1/2" h="h-4" className="mt-1.5" />
            <Bar w="w-full" h="h-3" className="mt-2.5" />
            <Bar w="w-5/6" h="h-3" className="mt-1.5" />
          </View>
        </View>

        {/* Procedimento card */}
        <View className="mt-3 rounded-2xl bg-white p-5" style={SOFT_SHADOW}>
          <Bar w="w-28" h="h-3.5" />
          <Bar w="w-full" h="h-4" className="mt-2.5" />
          <Bar w="w-2/3" h="h-4" className="mt-1.5" />
        </View>
      </Animated.View>
    </View>
  );
}
