import { View, Text, ActivityIndicator } from 'react-native';
import { TowersMark } from './TowersMark';

/**
 * First-frame launch screen shown while the root layout resolves the onboarding
 * state. Carries the same Due Torri identity as the app icon (brick mark on the
 * warm parchment background) so the app never flashes a bare white screen with an
 * off-brand spinner before the feed mounts.
 */
export function AppLoading() {
  return (
    <View className="flex-1 items-center justify-center bg-parchment-100">
      <TowersMark size={76} color="#9B2335" />
      <Text className="mt-5 text-xl font-bold text-ink-800">Pratiche Edilizie</Text>
      <Text className="text-base text-stone-600">Bologna</Text>
      <ActivityIndicator size="small" color="#9B2335" className="mt-8" />
    </View>
  );
}
