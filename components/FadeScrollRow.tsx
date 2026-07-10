import { useState, type ReactNode } from 'react';
import {
  View,
  ScrollView,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { edgeFadeVisibility } from '../lib/edge-fade';

const FADE_WIDTH = 28;
// The filter panel sits on a white surface; the fades dissolve chips into it.
const SOLID = '#ffffff';
const TRANSPARENT = 'rgba(255,255,255,0)';

/**
 * A horizontal scroll row that hints at clipped, off-screen content with subtle
 * left/right edge fades. The fades appear only when the content overflows and
 * only on the side that has more content (see {@link edgeFadeVisibility}) — a row
 * that fits shows none. Drop-in replacement for a bare `<ScrollView horizontal>`;
 * put the row's own margin (e.g. `mb-3`) on this wrapper via `className`.
 */
export function FadeScrollRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const { left, right } = edgeFadeVisibility(contentWidth, containerWidth, scrollX);

  return (
    <View
      className={className}
      onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
          setScrollX(e.nativeEvent.contentOffset.x)
        }>
        {/* Measure content width from a row wrapper's onLayout rather than the
            ScrollView's onContentSizeChange: react-native-web never fires the
            latter, so on the web export (screenshot harness) contentWidth stayed
            0, maxScroll 0, and no fade ever rendered. onLayout fires on both web
            and native, so the fade now shows wherever the row overflows. */}
        <View
          style={{ flexDirection: 'row' }}
          onLayout={(e: LayoutChangeEvent) => setContentWidth(e.nativeEvent.layout.width)}>
          {children}
        </View>
      </ScrollView>
      {left ? (
        <LinearGradient
          pointerEvents="none"
          colors={[SOLID, TRANSPARENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: FADE_WIDTH }}
        />
      ) : null}
      {right ? (
        <LinearGradient
          pointerEvents="none"
          colors={[TRANSPARENT, SOLID]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FADE_WIDTH }}
        />
      ) : null}
    </View>
  );
}
