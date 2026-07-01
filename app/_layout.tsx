import '../global.css';
import { useEffect, useCallback, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { isOnboardingDone, isNotificationsEnabled } from '../lib/preferences';
import { registerBackgroundSync } from '../lib/background-sync';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  const checkOnboarding = useCallback(async () => {
    const done = await isOnboardingDone();
    setOnboarded(done);
    setReady(true);
  }, []);

  // Register background sync if notifications are enabled
  useEffect(() => {
    isNotificationsEnabled().then((enabled) => {
      if (enabled) registerBackgroundSync();
    });
  }, []);

  // Re-check onboarding state every time segments change (i.e. after navigation)
  useEffect(() => {
    checkOnboarding();
  }, [segments]);

  useEffect(() => {
    if (!ready) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboarded && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [ready, onboarded]);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="permit/[id]"
          options={{
            headerShown: true,
            title: 'Dettaglio Pratica',
            presentation: 'card',
            headerStyle: { backgroundColor: '#9B2335' },
            headerTintColor: '#ffffff',
          }}
        />
      </Stack>
    </>
  );
}
