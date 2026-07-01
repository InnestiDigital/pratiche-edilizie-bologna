import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Alert } from 'react-native';
import {
  QUARTIERI,
  FILING_TYPE_ORDER,
  FILING_TYPE_LABELS,
  TAG_LABELS,
  type FilingType,
  type Quartiere,
} from '../../lib/constants';
import {
  loadPreferences,
  savePreferences,
  isNotificationsEnabled,
  setNotificationsEnabled,
} from '../../lib/preferences';
import { requestNotificationPermissions } from '../../lib/notifications';
import { registerBackgroundSync, unregisterBackgroundSync } from '../../lib/background-sync';

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-2 mt-6 px-4">
      <Text className="text-base font-bold text-ink-800">{title}</Text>
      {hint && <Text className="mt-0.5 text-xs text-stone-400">{hint}</Text>}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  isLast,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${
        !isLast ? 'border-b border-parchment-200' : ''
      }`}>
      <Text className="flex-1 text-base text-ink-800">{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#e2d9cd', true: '#9B2335' }}
        thumbColor="#fdfcfa"
        ios_backgroundColor="#e2d9cd"
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [zones, setZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [filingTypes, setFilingTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([loadPreferences(), isNotificationsEnabled()]).then(([prefs, notifEnabled]) => {
      setZones(new Set(prefs.zones));
      setFilingTypes(new Set(prefs.filingTypes));
      setTags(new Set(prefs.tags));
      setNotificationsOn(notifEnabled);
      setLoaded(true);
    });
  }, []);

  const handleToggleNotifications = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Permessi necessari',
          'Abilita le notifiche nelle Impostazioni del dispositivo per ricevere aggiornamenti.'
        );
        return;
      }
      await setNotificationsEnabled(true);
      await registerBackgroundSync();
      setNotificationsOn(true);
    } else {
      await setNotificationsEnabled(false);
      await unregisterBackgroundSync();
      setNotificationsOn(false);
    }
  };

  const toggleZone = (zone: Quartiere) => {
    setZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      const arr = [...next] as Quartiere[];
      savePreferences({ zones: arr });
      return next;
    });
  };

  const toggleFilingType = (type: FilingType) => {
    setFilingTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      const arr = [...next] as FilingType[];
      savePreferences({ filingTypes: arr });
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      savePreferences({ tags: [...next] });
      return next;
    });
  };

  const handleReset = () => {
    Alert.alert(
      'Ripristina Predefiniti',
      'Tutti i filtri verranno reimpostati ai valori predefiniti. Continuare?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Ripristina',
          style: 'destructive',
          onPress: () => {
            setZones(new Set(QUARTIERI));
            setFilingTypes(new Set(FILING_TYPE_ORDER));
            setTags(new Set());
            savePreferences({
              zones: [...QUARTIERI],
              filingTypes: [...FILING_TYPE_ORDER],
              tags: [],
            });
          },
        },
      ]
    );
  };

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-parchment-100">
        <Text className="text-stone-400">Caricamento...</Text>
      </View>
    );
  }

  const tagEntries = Object.entries(TAG_LABELS);

  return (
    <ScrollView className="flex-1 bg-parchment-100">
      <SectionHeader
        title="Notifiche"
        hint="Controlla in background e avvisa quando ci sono nuove pratiche"
      />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        <ToggleRow
          label="Aggiornamenti automatici"
          value={notificationsOn}
          onToggle={handleToggleNotifications}
          isLast
        />
      </View>

      <SectionHeader title="Quartieri" hint={`${zones.size} di ${QUARTIERI.length} attivi`} />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        {QUARTIERI.map((zone, i) => (
          <ToggleRow
            key={zone}
            label={zone}
            value={zones.has(zone)}
            onToggle={() => toggleZone(zone)}
            isLast={i === QUARTIERI.length - 1}
          />
        ))}
      </View>

      <SectionHeader
        title="Tipo di Pratica"
        hint={`${filingTypes.size} di ${FILING_TYPE_ORDER.length} attivi`}
      />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        {FILING_TYPE_ORDER.map((type, i) => (
          <ToggleRow
            key={type}
            label={FILING_TYPE_LABELS[type]}
            value={filingTypes.has(type)}
            onToggle={() => toggleFilingType(type)}
            isLast={i === FILING_TYPE_ORDER.length - 1}
          />
        ))}
      </View>

      <SectionHeader title="Filtri Etichette" hint="Mostra solo pratiche con queste etichette" />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        {tagEntries.map(([tag, label], i) => (
          <ToggleRow
            key={tag}
            label={label}
            value={tags.has(tag)}
            onToggle={() => toggleTag(tag)}
            isLast={i === tagEntries.length - 1}
          />
        ))}
      </View>

      <View className="p-4 pb-10">
        <Pressable
          onPress={handleReset}
          className="items-center rounded-xl border border-stone-300 bg-white py-3">
          <Text className="font-semibold text-stone-600">Ripristina Predefiniti</Text>
        </Pressable>

        <Text className="mt-6 text-center text-xs text-stone-400">
          Pratiche Edilizie Bologna v1.0{'\n'}
          Dati da opendata.comune.bologna.it{'\n'}
          Licenza CC BY 4.0
        </Text>
      </View>
    </ScrollView>
  );
}
