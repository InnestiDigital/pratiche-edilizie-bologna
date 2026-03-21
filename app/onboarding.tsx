import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  QUARTIERI,
  FILING_TYPE_ORDER,
  FILING_TYPE_LABELS,
  type FilingType,
  type Quartiere,
} from "../lib/constants";
import { completeOnboarding } from "../lib/preferences";

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
      className={`mb-2 mr-2 rounded-full px-4 py-2.5 ${
        selected ? "bg-brick-600" : "bg-white border border-stone-300"
      }`}
    >
      <Text
        className={`text-sm font-semibold ${
          selected ? "text-white" : "text-ink-600"
        }`}
      >
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
    PDC: { active: "bg-pdc-mid", text: "text-white" },
    SCIA: { active: "bg-scia-mid", text: "text-white" },
    CILA: { active: "bg-cila-mid", text: "text-white" },
  }[type];

  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 mr-2 rounded-full px-5 py-2.5 ${
        selected ? colors.active : "bg-white border border-stone-300"
      }`}
    >
      <Text
        className={`text-sm font-bold ${
          selected ? colors.text : "text-ink-600"
        }`}
      >
        {type}
      </Text>
      <Text
        className={`text-xs ${
          selected ? "text-white/80" : "text-stone-500"
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [selectedZones, setSelectedZones] = useState<Set<Quartiere>>(
    new Set(QUARTIERI),
  );
  const [selectedTypes, setSelectedTypes] = useState<Set<FilingType>>(
    new Set(FILING_TYPE_ORDER),
  );
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
    router.replace("/(tabs)/sync");
  };

  const canStart = selectedZones.size > 0 && selectedTypes.size > 0;

  return (
    <ScrollView
      className="flex-1 bg-parchment-100"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View className="flex-1 px-6 pb-10 pt-16">
        {/* Header */}
        <View className="mb-10 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brick-600">
            <Ionicons name="business-outline" size={32} color="white" />
          </View>
          <Text className="text-center text-2xl font-bold text-ink-800">
            Pratiche Edilizie Bologna
          </Text>
          <Text className="mt-2 text-center text-base leading-6 text-stone-500">
            Consulta le pratiche edilizie del Comune di Bologna.{"\n"}
            Scegli i quartieri e i tipi di pratica che ti interessano.
          </Text>
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
        <Text className="mb-2 text-base font-bold text-ink-800">
          Tipo di pratica
        </Text>
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
          className={`flex-row items-center justify-center rounded-xl py-4 ${
            !canStart || syncing ? "bg-stone-300" : "bg-brick-600"
          }`}
        >
          {syncing ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text className="ml-3 text-lg font-bold text-white">
                Salvataggio...
              </Text>
            </>
          ) : (
            <>
              <Text className="text-lg font-bold text-white">Inizia</Text>
              <Ionicons
                name="arrow-forward"
                size={22}
                color="white"
                style={{ marginLeft: 8 }}
              />
            </>
          )}
        </Pressable>

        <Text className="mt-4 text-center text-xs text-stone-400">
          Dati da opendata.comune.bologna.it — Licenza CC BY 4.0
        </Text>
      </View>
    </ScrollView>
  );
}
