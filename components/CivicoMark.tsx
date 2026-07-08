import { View } from 'react-native';

/**
 * The app's brand mark: the Civico map-pin — a cream pin (ring head + tapered tail)
 * enclosing a stylized *isolato* (city-block) grid, the same silhouette as the app
 * icon (`assets/icon.png`). Rebuilt from plain Views so it renders on every platform
 * with no native SVG dependency, mirroring the old TowersMark contract.
 *
 * `color` is the pin/grid stroke (defaults to the icon's cream); the pin head and the
 * grid cells are transparent negative space so the mark sits on any background.
 */
export function CivicoMark({ size = 28, color = '#F5F0E8' }: { size?: number; color?: string }) {
  const s = size;

  // Pin head: a thick ring. Its hole is transparent so any background shows through.
  const ring = s * 0.66;
  const ringBorder = Math.max(2, ring * 0.13);

  // Tapered tail: a downward triangle drawn from borders. It attaches at the ring's
  // solid bottom rim (below the transparent hole), so its flat top edge merges into
  // the cream border rather than showing as a notch inside the hole.
  const tailHalf = ring * 0.3; // half-width where the tail meets the rim
  const tailTop = ring * 0.86;
  const tailHeight = s - tailTop;

  // Isolato grid centred in the ring hole: a rounded frame + a 3×3 cross of strokes.
  const grid = ring * 0.46;
  const stroke = Math.max(1.5, grid * 0.11);
  const gridLeft = ringBorder + (ring - 2 * ringBorder - grid) / 2;
  const gridTop = gridLeft; // ring is square, so the same inset centres it vertically

  return (
    <View style={{ width: ring, height: s }}>
      {/* Tapered tail (behind the head so the flat top edge is hidden by the ring) */}
      <View
        style={{
          position: 'absolute',
          top: tailTop,
          left: ring / 2 - tailHalf,
          width: 0,
          height: 0,
          borderLeftWidth: tailHalf,
          borderRightWidth: tailHalf,
          borderTopWidth: tailHeight,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
      {/* Pin head ring */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: ringBorder,
          borderColor: color,
          backgroundColor: 'transparent',
        }}
      />
      {/* Isolato grid: rounded frame + inner mullions, cells left transparent */}
      <View
        style={{ position: 'absolute', top: gridTop, left: gridLeft, width: grid, height: grid }}>
        <View
          style={{
            position: 'absolute',
            width: grid,
            height: grid,
            borderRadius: grid * 0.16,
            borderWidth: stroke,
            borderColor: color,
          }}
        />
        {/* Vertical mullions */}
        <View
          style={{
            position: 'absolute',
            left: grid / 3 - stroke / 2,
            top: 0,
            width: stroke,
            height: grid,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: (2 * grid) / 3 - stroke / 2,
            top: 0,
            width: stroke,
            height: grid,
            backgroundColor: color,
          }}
        />
        {/* Horizontal mullions */}
        <View
          style={{
            position: 'absolute',
            top: grid / 3 - stroke / 2,
            left: 0,
            height: stroke,
            width: grid,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: (2 * grid) / 3 - stroke / 2,
            left: 0,
            height: stroke,
            width: grid,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}
