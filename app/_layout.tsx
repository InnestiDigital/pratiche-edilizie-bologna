import '../global.css';
import { useEffect, useCallback, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { isOnboardingDone, isNotificationsEnabled } from '../lib/preferences';
import { registerBackgroundSync } from '../lib/background-sync';
import {
  subscribeNotificationResponses,
  getInitialNotificationRoute,
} from '../lib/notification-routing';
import type { NotificationRoute } from '../lib/notification-link';
import { HeaderBrand } from '../components/HeaderBrand';
import { AppLoading } from '../components/AppLoading';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  // Monotonic nonce appended to a notification-driven navigate so a second tap
  // of the *same* target (e.g. two "new permits" notifications) still refires
  // the feed's deep-link effect — mirrors the feed's `t` param convention.
  const linkNonce = useRef(0);

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
  }, [checkOnboarding, segments]);

  // Route a tapped "new permits" notification to the feed — deep-linking to its
  // "Solo nuovi" filter when the notification announced genuinely-new permits,
  // so the resident lands on exactly those. Covers both a running-app tap
  // (subscribe) and the cold-start tap that launched the app (initial route).
  // Gated on `onboarded`: a notification only fires once notifications are
  // enabled (post-onboarding), and navigating pre-onboarding would race the
  // onboarding redirect below. Web shims both listeners to no-ops.
  useEffect(() => {
    if (!onboarded) return;
    let active = true;
    const go = (route: NotificationRoute) => {
      router.navigate({
        pathname: route.pathname,
        params: { ...route.params, t: String((linkNonce.current += 1)) },
      });
    };
    getInitialNotificationRoute().then((route) => {
      if (active && route) go(route);
    });
    const unsubscribe = subscribeNotificationResponses(go);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [onboarded, router]);

  useEffect(() => {
    if (!ready) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboarded && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [ready, onboarded, router, segments]);

  if (!ready) {
    return <AppLoading />;
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
            headerTitle: () => <HeaderBrand title="Dettaglio Pratica" />,
            headerTitleAlign: 'left',
            presentation: 'card',
            headerStyle: { backgroundColor: '#9B2335' },
            headerTintColor: '#ffffff',
          }}
        />
      </Stack>
    </>
  );
}
