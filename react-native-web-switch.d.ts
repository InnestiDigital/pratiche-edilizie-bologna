// react-native-web extends <Switch> with `activeThumbColor` — the thumb color used
// in the ON state (react-native core has no such prop and reuses `thumbColor` for
// both states). RN's own `SwitchProps` omit it, so the shared settings.tsx would
// otherwise fail tsc when it passes the prop. We declaration-merge it in as an
// optional string. The prop is inert on native and only corrects the web
// screenshot render the review loops depend on. See settings.tsx ToggleRow.
import 'react-native';

declare module 'react-native' {
  interface SwitchProps {
    activeThumbColor?: string;
  }
}
