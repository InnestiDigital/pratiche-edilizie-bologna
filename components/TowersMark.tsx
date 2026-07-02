import { View } from 'react-native';

/**
 * The app's brand mark: the Due Torri of Bologna (Asinelli + Garisenda) — the same
 * two-towers silhouette as the app icon, rebuilt from plain Views so it renders on
 * every platform with no native SVG dependency. The logo is deliberately blocky
 * (rectangular shafts, square crenellations), which maps cleanly onto Views.
 *
 * `color` is the tower/base fill (defaults to the icon's cream); gaps between the
 * crenellation teeth are transparent so the mark sits on any background.
 */
export function TowersMark({ size = 28, color = '#F5F0E8' }: { size?: number; color?: string }) {
  const s = size;
  // Tower shaft geometry, all proportional to `s` so the mark scales cleanly.
  const baseH = s * 0.1;
  const baseBottom = 0;
  const shaftBottom = baseH * 0.6; // shafts overlap the base slightly

  const tallW = s * 0.24;
  const tallH = s * 0.74;
  const shortW = s * 0.2;
  const shortH = s * 0.52;

  return (
    <View style={{ width: s * 0.92, height: s }}>
      {/* Short tower (Garisenda) — leans toward the tall one */}
      <Tower
        color={color}
        width={shortW}
        height={shortH}
        style={{
          position: 'absolute',
          left: s * 0.14,
          bottom: shaftBottom,
          transform: [{ rotate: '5deg' }],
        }}
      />
      {/* Tall tower (Asinelli) */}
      <Tower
        color={color}
        width={tallW}
        height={tallH}
        style={{ position: 'absolute', left: s * 0.52, bottom: shaftBottom }}
      />
      {/* Base platform */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: baseBottom,
          height: baseH,
          borderRadius: baseH * 0.3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** One tower: a rectangular shaft topped by three crenellation teeth. */
function Tower({
  color,
  width,
  height,
  style,
}: {
  color: string;
  width: number;
  height: number;
  style: object;
}) {
  const toothH = Math.max(2, height * 0.14);
  const toothW = width * 0.28;
  const shaftH = height - toothH;
  return (
    <View style={[{ width, height, alignItems: 'stretch' }, style]}>
      {/* Crenellation teeth */}
      <View style={{ height: toothH, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: toothW, backgroundColor: color }} />
        <View style={{ width: toothW, backgroundColor: color }} />
        <View style={{ width: toothW, backgroundColor: color }} />
      </View>
      {/* Shaft */}
      <View style={{ height: shaftH, backgroundColor: color }} />
    </View>
  );
}
