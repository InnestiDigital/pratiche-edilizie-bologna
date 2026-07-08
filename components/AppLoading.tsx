import { View, Text, ActivityIndicator } from 'react-native';
import { CivicoMark } from './CivicoMark';
import { APP_NAME } from '../lib/brand';

/**
 * First-frame launch screen shown while the root layout resolves the onboarding
 * state. Carries the same Civico identity as the app icon (map-pin mark on the warm
 * parchment background) so the app never flashes a bare white screen with an
 * off-brand spinner before the feed mounts.
 */
export function AppLoading() {
  return (
    <View className="flex-1 items-center justify-center bg-parchment-100">
      <CivicoMark size={76} color="#9B2335" />
      <Text className="mt-5 text-xl font-bold text-ink-800">{APP_NAME}</Text>
      <Text className="text-base text-stone-600">Bologna</Text>
      <ActivityIndicator size="small" color="#9B2335" className="mt-8" />
    </View>
  );
}
