import { View, Text, Pressable } from 'react-native';
import { Link, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Pagina non trovata', headerShown: false }} />
      <View className="flex-1 items-center justify-center bg-parchment-100 px-8">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl bg-brick-600">
          <Ionicons name="help-outline" size={40} color="white" />
        </View>
        <Text className="text-center text-2xl font-bold text-ink-800">Pagina non trovata</Text>
        <Text className="mt-3 text-center text-base leading-6 text-stone-500">
          La pratica o la schermata richiesta non esiste o non è più disponibile.
        </Text>

        <Link href="/(tabs)" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Torna alla home"
            className="mt-8 flex-row items-center justify-center rounded-xl bg-brick-600 px-6 py-4">
            <Ionicons name="home-outline" size={20} color="white" />
            <Text className="ml-2 text-lg font-bold text-white">Torna alla home</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}
