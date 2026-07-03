import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  QUARTIERI,
  FILING_TYPE_ORDER,
  FILING_TYPE_LABELS,
  type FilingType,
  type Quartiere,
} from '../lib/constants';
import { completeOnboarding } from '../lib/preferences';
import { TowersMark } from '../components/TowersMark';

/** One row in the first-run "come funziona" card: brand-tinted icon + a plain
 *  line describing what the app does — mirrors the Settings "Informazioni" card. */
function FeatureRow({
  icon,
  text,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center px-4 py-3.5 ${
        !isLast ? 'border-b border-parchment-200' : ''
      }`}>
      <View className="mr-3.5 h-9 w-9 items-center justify-center rounded-full bg-brick-50">
        <Ionicons name={icon} size={18} color="#9B2335" />
      </View>
      <Text className="flex-1 text-sm leading-5 text-ink-600">{text}</Text>
    </View>
  );
}

function ZoneChip({
  zone,
  selected,
  onPress,
}: {
  zone: Quartiere;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Quartiere ${zone}`}
      accessibilityState={{ selected }}
      className={`mb-2 mr-2 rounded-full px-4 py-2.5 ${
        selected ? 'bg-brick-600' : 'border border-stone-300 bg-white'
      }`}>
      <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-ink-600'}`}>
        {zone}
      </Text>
    </Pressable>
  );
}

function TypeChip({
  type,
  label,
  selected,
  onPress,
}: {
  type: FilingType;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = {
    PDC: { active: 'bg-pdc-mid', text: 'text-white' },
    SCIA: { active: 'bg-scia-mid', text: 'text-white' },
    CILA: { active: 'bg-cila-mid', text: 'text-white' },
  }[type];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Tipo di pratica ${type}, ${label}`}
      accessibilityState={{ selected }}
      className={`mb-2 mr-2 rounded-full px-5 py-2.5 ${
        selected ? colors.active : 'border border-stone-300 bg-white'
      }`}>
      <Text className={`text-sm font-bold ${selected ? colors.text : 'text-ink-600'}`}>{type}</Text>
      <Text
        className={`text-xs ${selected ? 'text-white/80' : 'text-stone-500'}`}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [selectedZones, setSelectedZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [selectedTypes, setSelectedTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  const [syncing, setSyncing] = useState(false);

  const toggleZone = (zone: Quartiere) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  };

  const toggleType = (type: FilingType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleStart = async () => {
    setSyncing(true);
    await completeOnboarding({
      zones: [...selectedZones],
      filingTypes: [...selectedTypes],
    });
    router.replace('/(tabs)/sync');
  };

  const canStart = selectedZones.size > 0 && selectedTypes.size > 0;

  return (
    <ScrollView className="flex-1 bg-parchment-100" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 px-6 pb-10 pt-16">
        {/* Header */}
        <View className="mb-6 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brick-600">
            <TowersMark size={38} />
          </View>
          <Text className="text-center text-2xl font-bold text-ink-800">
            Pratiche Edilizie Bologna
          </Text>
          <Text className="mt-2 text-center text-base leading-6 text-stone-500">
            Consulta le pratiche edilizie del Comune di Bologna.
          </Text>
        </View>

        {/* What the app does — sells the value prop + on-device privacy stance
            before the user commits to picking filters (the rest of the app leans
            on this promise; the first-run screen shouldn't stay silent on it). */}
        <View
          className="mb-8 overflow-hidden rounded-2xl bg-white"
          style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          <FeatureRow
            icon="funnel-outline"
            text="Segui solo i quartieri e i tipi di pratica che ti interessano."
          />
          <FeatureRow
            icon="notifications-outline"
            text="Ricevi un avviso quando vengono pubblicate nuove pratiche."
          />
          <FeatureRow
            icon="lock-closed-outline"
            text="Tutto sul tuo dispositivo: nessun account, nessun tracciamento."
            isLast
          />
        </View>

        {/* Quartieri */}
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink-800">Quartieri</Text>
          <Text className="text-sm text-brick-600">
            {selectedZones.size}/{QUARTIERI.length}
          </Text>
        </View>
        <View className="mb-6 flex-row flex-wrap">
          {QUARTIERI.map((zone) => (
            <ZoneChip
              key={zone}
              zone={zone}
              selected={selectedZones.has(zone)}
              onPress={() => toggleZone(zone)}
            />
          ))}
        </View>

        {/* Tipo pratica */}
        <Text className="mb-2 text-base font-bold text-ink-800">Tipo di pratica</Text>
        <View className="mb-8 flex-row flex-wrap">
          {FILING_TYPE_ORDER.map((type) => (
            <TypeChip
              key={type}
              type={type}
              label={FILING_TYPE_LABELS[type]}
              selected={selectedTypes.has(type)}
              onPress={() => toggleType(type)}
            />
          ))}
        </View>

        <View className="flex-1" />

        {/* Start button */}
        <Pressable
          onPress={handleStart}
          disabled={!canStart || syncing}
          accessibilityRole="button"
          accessibilityLabel={syncing ? 'Salvataggio in corso' : 'Inizia'}
          accessibilityState={{ disabled: !canStart || syncing, busy: syncing }}
          className={`flex-row items-center justify-center rounded-xl py-4 ${
            !canStart || syncing ? 'bg-stone-300' : 'bg-brick-600'
          }`}>
          {syncing ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text className="ml-3 text-lg font-bold text-white">Salvataggio...</Text>
            </>
          ) : (
            <>
              <Text className="text-lg font-bold text-white">Inizia</Text>
              <Ionicons name="arrow-forward" size={22} color="white" style={{ marginLeft: 8 }} />
            </>
          )}
        </Pressable>

        <Text className="mt-4 text-center text-xs text-stone-600">
          Dati da opendata.comune.bologna.it — Licenza CC BY 4.0
        </Text>
      </View>
    </ScrollView>
  );
}
