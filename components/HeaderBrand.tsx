import { View, Text } from 'react-native';
import { CivicoMark } from './CivicoMark';

/**
 * Header title used across the app: the Civico brand mark next to the screen title,
 * so every screen carries the same identity as the app icon. Rendered via
 * expo-router's `headerTitle` (with `headerTitleAlign: 'left'`) on the brick header.
 */
export function HeaderBrand({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <CivicoMark size={26} />
      <Text
        style={{ color: '#ffffff', fontWeight: '700', fontSize: 17, marginLeft: 10 }}
        numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
