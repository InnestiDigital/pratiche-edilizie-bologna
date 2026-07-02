import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HeaderBrand } from '../../components/HeaderBrand';

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
          headerTitle: () => <HeaderBrand title="Pratiche Edilizie Bologna" />,
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
          title: 'Filtri',
          headerTitle: () => <HeaderBrand title="Impostazioni" />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="options-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
