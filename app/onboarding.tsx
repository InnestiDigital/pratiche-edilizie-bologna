import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  QUARTIERI,
  FILING_TYPE_ORDER,
  FILING_TYPE_FULL_NAMES,
  FILING_COLORS,
  type FilingType,
  type Quartiere,
} from '../lib/constants';
import { completeOnboarding } from '../lib/preferences';
import { APP_NAME } from '../lib/brand';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, type Category } from '../lib/sources';
import { PERSONAS, PERSONA_PROFILES, personaDefaults, type Persona } from '../lib/personas';
import { CivicoMark } from '../components/CivicoMark';

/** Icon per persona — a UI concern kept out of the pure `lib/personas` registry
 *  (which stays React-free) so the glyph name is typed against Ionicons here. */
const PERSONA_ICONS: Record<Persona, keyof typeof Ionicons.glyphMap> = {
  professionista: 'construct-outline',
  compravendita: 'home-outline',
  impresa: 'business-outline',
  cittadino: 'people-outline',
  esplora: 'compass-outline',
};

/** One selectable persona row in the first-run "chi sei" picker: a brand-tinted
 *  icon + the role label + a one-line blurb, with a radio-style check when active.
 *  Tapping it seeds the interest/filing pickers below with that role's defaults. */
function PersonaRow({
  persona,
  selected,
  onPress,
  isLast,
}: {
  persona: Persona;
  selected: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const profile = PERSONA_PROFILES[persona];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${profile.label}. ${profile.blurb}`}
      accessibilityState={{ selected }}
      className={`flex-row items-center px-4 py-3.5 ${
        !isLast ? 'border-b border-parchment-200' : ''
      } ${selected ? 'bg-brick-50' : ''}`}>
      <View
        className={`mr-3.5 h-10 w-10 items-center justify-center rounded-full ${
          selected ? 'bg-brick-600' : 'bg-brick-50'
        }`}>
        <Ionicons name={PERSONA_ICONS[persona]} size={20} color={selected ? 'white' : '#9B2335'} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-ink-800">{profile.label}</Text>
        <Text className="mt-0.5 text-xs leading-4 text-stone-500">{profile.blurb}</Text>
      </View>
      <View
        className={`ml-3 h-6 w-6 items-center justify-center rounded-full ${
          selected ? 'bg-brick-600' : 'border-2 border-stone-300 bg-white'
        }`}>
        {selected && <Ionicons name="checkmark" size={15} color="white" />}
      </View>
    </Pressable>
  );
}

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

/** One selectable filing-type row in the first-run picker: a filing-colored
 *  acronym badge + the spelled-out name (from FILING_TYPE_FULL_NAMES, so SCIA/CILA
 *  no longer echo their own acronym as a redundant sublabel) + a check circle.
 *  Full-width rows give the long names room to breathe and match the card language
 *  used on the Settings + detail screens. */
function TypeRow({
  type,
  fullName,
  selected,
  onPress,
  isLast,
}: {
  type: FilingType;
  fullName: string;
  selected: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const color = FILING_COLORS[type];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={`${type}, ${fullName}`}
      accessibilityState={{ checked: selected }}
      className={`flex-row items-center px-4 py-3.5 ${
        !isLast ? 'border-b border-parchment-200' : ''
      }`}>
      <View
        className="mr-3.5 w-16 items-center rounded-lg py-1.5"
        style={{ backgroundColor: color.bg }}>
        <Text className="text-sm font-bold" style={{ color: color.text }}>
          {type}
        </Text>
      </View>
      <Text className="flex-1 text-[15px] font-medium leading-5 text-ink-800">{fullName}</Text>
      <View
        className={`ml-3 h-6 w-6 items-center justify-center rounded-full ${
          selected ? 'bg-brick-600' : 'border-2 border-stone-300 bg-white'
        }`}>
        {selected && <Ionicons name="checkmark" size={15} color="white" />}
      </View>
    </Pressable>
  );
}

/** One selectable "interesse" (civic category) row in the first-run picker: a
 *  category-colored swatch + the category label + a check circle. Mirrors the
 *  TypeRow language so the two pickers read as one family. */
function InterestRow({
  category,
  selected,
  onPress,
  isLast,
}: {
  category: Category;
  selected: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const color = CATEGORY_COLORS[category];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={CATEGORY_LABELS[category]}
      accessibilityState={{ checked: selected }}
      className={`flex-row items-center px-4 py-3.5 ${
        !isLast ? 'border-b border-parchment-200' : ''
      }`}>
      <View
        className="mr-3.5 h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: color.bg }}>
        <View className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color.text }} />
      </View>
      <Text className="flex-1 text-[15px] font-medium leading-5 text-ink-800">
        {CATEGORY_LABELS[category]}
      </Text>
      <View
        className={`ml-3 h-6 w-6 items-center justify-center rounded-full ${
          selected ? 'bg-brick-600' : 'border-2 border-stone-300 bg-white'
        }`}>
        {selected && <Ionicons name="checkmark" size={15} color="white" />}
      </View>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [selectedZones, setSelectedZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [selectedInterests, setSelectedInterests] = useState<Set<Category>>(new Set(CATEGORIES));
  const [selectedTypes, setSelectedTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  // The persona whose defaults are currently applied, or null once the user has
  // hand-tweaked the pickers (so the highlight never lies about a custom set).
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Picking a persona seeds the interest + filing pickers with that role's
  // defaults; the user can still refine them below.
  const applyPersona = (persona: Persona) => {
    const { interests, filingTypes } = personaDefaults(persona);
    setSelectedInterests(new Set(interests));
    setSelectedTypes(new Set(filingTypes));
    setSelectedPersona(persona);
  };

  const toggleZone = (zone: Quartiere) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  };

  // At least one interest must stay selected (mirrors toggleType): a zero-category
  // sync would download nothing. A manual tweak means the set no longer matches a
  // persona preset, so drop the persona highlight.
  const toggleInterest = (category: Category) => {
    setSelectedPersona(null);
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        if (next.size > 1) next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleType = (type: FilingType) => {
    setSelectedPersona(null);
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

  const ediliziaSelected = selectedInterests.has('edilizia');

  const handleStart = async () => {
    setSyncing(true);
    await completeOnboarding({
      zones: [...selectedZones],
      interests: [...selectedInterests],
      filingTypes: [...selectedTypes],
    });
    router.replace('/(tabs)/sync');
  };

  // Filing types only matter when edilizia is followed; otherwise their selection
  // is irrelevant and never blocks starting.
  const canStart =
    selectedZones.size > 0 &&
    selectedInterests.size > 0 &&
    (!ediliziaSelected || selectedTypes.size > 0);

  return (
    <ScrollView className="flex-1 bg-parchment-100" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 px-6 pb-10 pt-16">
        {/* Header */}
        <View className="mb-6 items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brick-600">
            <CivicoMark size={38} />
          </View>
          <Text className="text-center text-2xl font-bold text-ink-800">{APP_NAME}</Text>
          <Text className="mt-2 text-center text-base leading-6 text-stone-500">
            Cosa cambia intorno a te — dati aperti del Comune di Bologna.
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
            text="Ricevi un avviso quando vengono pubblicate nuove voci."
          />
          <FeatureRow
            icon="lock-closed-outline"
            text="Tutto sul tuo dispositivo: nessun account, nessun tracciamento."
            isLast
          />
        </View>

        {/* Chi sei — the "right first question": pick a role and the interest +
            filing pickers below pre-fill with defaults suited to that task, so a
            new user starts on a tuned feed instead of the everything-selected
            generic one. Fully editable afterward; tweaking clears the highlight. */}
        <Text className="mb-1 text-base font-bold text-ink-800">Chi sei?</Text>
        <Text className="mb-2 text-sm leading-5 text-stone-500">
          Scegli il profilo più vicino a te: imposteremo i filtri giusti (puoi cambiarli quando
          vuoi).
        </Text>
        <View
          className="mb-8 overflow-hidden rounded-2xl bg-white"
          style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          {PERSONAS.map((persona, i) => (
            <PersonaRow
              key={persona}
              persona={persona}
              selected={selectedPersona === persona}
              onPress={() => applyPersona(persona)}
              isLast={i === PERSONAS.length - 1}
            />
          ))}
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

        {/* Interessi — which civic categories to follow. Defaults to all; the
            edilizia filing-type card below appears only when Edilizia is kept. */}
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink-800">Cosa vuoi seguire</Text>
          <Text className="text-sm text-brick-600">
            {selectedInterests.size}/{CATEGORIES.length}
          </Text>
        </View>
        <View
          className="mb-8 overflow-hidden rounded-2xl bg-white"
          style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          {CATEGORIES.map((category, i) => (
            <InterestRow
              key={category}
              category={category}
              selected={selectedInterests.has(category)}
              onPress={() => toggleInterest(category)}
              isLast={i === CATEGORIES.length - 1}
            />
          ))}
        </View>

        {/* Tipo pratica edilizia — only relevant when Edilizia is followed. */}
        {ediliziaSelected && (
          <>
            <Text className="mb-2 text-base font-bold text-ink-800">Tipo di pratica edilizia</Text>
            <View
              className="mb-8 overflow-hidden rounded-2xl bg-white"
              style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
              {FILING_TYPE_ORDER.map((type, i) => (
                <TypeRow
                  key={type}
                  type={type}
                  fullName={FILING_TYPE_FULL_NAMES[type]}
                  selected={selectedTypes.has(type)}
                  onPress={() => toggleType(type)}
                  isLast={i === FILING_TYPE_ORDER.length - 1}
                />
              ))}
            </View>
          </>
        )}

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
