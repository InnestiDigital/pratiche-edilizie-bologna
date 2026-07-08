import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HeaderBrand } from '../../components/HeaderBrand';
import { APP_NAME } from '../../lib/brand';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#9B2335',
        tabBarInactiveTintColor: '#a89888',
        tabBarStyle: {
          backgroundColor: '#fdfcfa',
          borderTopColor: '#e2d9cd',
          height: 88,
          paddingBottom: 30,
          paddingTop: 8,
        },
        headerStyle: { backgroundColor: '#9B2335' },
        headerTintColor: '#ffffff',
        headerTitleAlign: 'left',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pratiche',
          headerTitle: () => <HeaderBrand title={APP_NAME} />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          title: 'Aggiorna',
          headerTitle: () => <HeaderBrand title="Aggiornamento Dati" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cloud-download-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          // Tab label matches the screen header ("Impostazioni") — the screen holds
          // notification + follow preferences, not just filters. A gear icon (not the
          // sliders `options-outline`) also disambiguates it from the feed's in-list
          // filter button, which owns that sliders glyph.
          title: 'Impostazioni',
          headerTitle: () => <HeaderBrand title="Impostazioni" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
