import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { CivicoMark } from '../../components/CivicoMark';
import { SettingsSkeleton } from '../../components/SettingsSkeleton';
import {
  QUARTIERI,
  FILING_TYPE_ORDER,
  FILING_TYPE_LABELS,
  FILING_COLORS,
  FILING_DATASET_KEY,
  TAG_LABELS,
  type FilingType,
  type Quartiere,
} from '../../lib/constants';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SOURCES,
  type Category,
} from '../../lib/sources';
import {
  loadPreferences,
  savePreferences,
  isNotificationsEnabled,
  setNotificationsEnabled,
} from '../../lib/preferences';
import { requestNotificationPermissions } from '../../lib/notifications';
import { registerBackgroundSync, unregisterBackgroundSync } from '../../lib/background-sync';
import { getDb } from '../../lib/db';
import { CITY } from '../../lib/city';
import { APP_NAME } from '../../lib/brand';
import { countPermits, getStats, getEdiliziaStreets } from '../../lib/queries';
import { buildStreetIndex, type StreetIndex } from '../../lib/street-index';
import { resolveAddressToHome } from '../../lib/home-geocode';
import type { HomeAddressResolution } from '../../lib/home-address';
import { buildMatchSummary } from '../../lib/settings-match-summary';
import { recordNoun } from '../../lib/record-noun';
import {
  HOME_RADIUS_OPTIONS,
  formatRadiusLabel,
  homeAlertCaption,
  DEFAULT_HOME_RADIUS_M,
  type HomeLocation,
} from '../../lib/home-location';

/** Read-only, non-personal source Bologna publishes the open data under. */
const OPEN_DATA_PORTAL_URL = 'https://opendata.comune.bologna.it';
const DATA_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/deed.it';

/** One tappable row in the "Informazioni" card: leading icon, label + sublabel,
 *  trailing external-link chevron. Opens `url` in the browser. */
function InfoLinkRow({
  icon,
  label,
  sublabel,
  url,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  url: string;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={`${label}, ${sublabel}`}
      accessibilityHint="Apre il collegamento nel browser"
      className={`flex-row items-center px-4 py-3 ${!isLast ? 'border-b border-parchment-200' : ''}`}>
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-parchment-100">
        <Ionicons name={icon} size={17} color="#8B7355" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink-800">{label}</Text>
        <Text className="text-xs text-stone-500">{sublabel}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color="#a89888" />
    </Pressable>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-2 mt-6 px-4">
      <Text className="text-base font-bold text-ink-800">{title}</Text>
      {hint && <Text className="mt-0.5 text-xs text-stone-600">{hint}</Text>}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  isLast,
  leadingColor,
  count,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
  /** Optional brand accent dot shown before the label (filing-type color). */
  leadingColor?: string;
  /** Optional count of stored permits for this filter — shown as a muted pill so
      you can see how much data each zone / type holds before toggling it. */
  count?: number;
}) {
  const a11yLabel = count === undefined ? label : `${label}, ${count} ${recordNoun(count)}`;
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${
        !isLast ? 'border-b border-parchment-200' : ''
      }`}>
      <View className="flex-1 flex-row items-center">
        {leadingColor && (
          <View
            className="mr-2.5 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: leadingColor }}
          />
        )}
        <Text className="text-base text-ink-800">{label}</Text>
      </View>
      {count !== undefined && (
        <Text
          className={`mr-3 text-sm font-semibold ${count > 0 ? 'text-stone-600' : 'text-stone-400'}`}>
          {count.toLocaleString('it-IT')}
        </Text>
      )}
      <Switch
        value={value}
        onValueChange={onToggle}
        accessibilityLabel={a11yLabel}
        trackColor={{ false: '#e2d9cd', true: '#9B2335' }}
        thumbColor="#fdfcfa"
        // react-native-web reads `activeThumbColor` (not `thumbColor`) for the ON
        // state; without it the web render falls back to a teal default thumb that
        // clashes with the crimson track. Inert on native (core Switch has no such
        // prop and uses `thumbColor` for both states) — this only fixes the web
        // screenshot fidelity the review loops depend on.
        activeThumbColor="#fdfcfa"
        ios_backgroundColor="#e2d9cd"
      />
    </View>
  );
}

/** Italian message for each non-`ok` resolution outcome, shown inline in the modal. */
const RESOLUTION_MESSAGE: Record<Exclude<HomeAddressResolution['kind'], 'ok'>, string> = {
  'empty-index': 'Sincronizza prima la tua zona per poter cercare una via.',
  'unknown-street': 'Via non trovata tra i dati scaricati. Scegline una dall’elenco.',
  'no-coordinate': 'Non è stato possibile posizionare questo indirizzo. Prova un civico diverso.',
  'fetch-failed': 'Impossibile raggiungere i dati civici. Controlla la connessione e riprova.',
};

/** How many matching streets to render in the picker (bounded for performance). */
const STREET_PICKER_LIMIT = 40;

/**
 * "Imposta indirizzo" — the second way to set the home anchor (the first is a
 * permit detail's "Imposta come casa"). The user filters the LOCAL street list
 * (built from synced edilizia rows), picks a via, optionally types a civico, and
 * the resolver geocodes it against the Bologna civici gazetteer. Every failure is
 * surfaced explicitly — never a silent wrong pin. No external geocoder.
 */
function AddressModal({
  visible,
  onClose,
  onSet,
}: {
  visible: boolean;
  onClose: () => void;
  onSet: (home: HomeLocation) => void;
}) {
  const [streetIndex, setStreetIndex] = useState<StreetIndex | null>(null);
  const [search, setSearch] = useState('');
  const [selectedVia, setSelectedVia] = useState<string | null>(null);
  const [civico, setCivico] = useState('');
  const [resolving, setResolving] = useState(false);
  const [errorKind, setErrorKind] = useState<Exclude<HomeAddressResolution['kind'], 'ok'> | null>(
    null
  );

  // Load the local street list each time the modal opens; reset transient state.
  useEffect(() => {
    if (!visible) return;
    setStreetIndex(null);
    setSearch('');
    setSelectedVia(null);
    setCivico('');
    setErrorKind(null);
    let cancelled = false;
    getDb()
      .then((db) => getEdiliziaStreets(db))
      .then((entries) => {
        if (!cancelled) setStreetIndex(buildStreetIndex(entries));
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const names = streetIndex?.names ?? [];
  const query = search.trim().toLowerCase();
  const matches = (query ? names.filter((n) => n.toLowerCase().includes(query)) : names).slice(
    0,
    STREET_PICKER_LIMIT
  );

  const handleSet = async () => {
    if (!streetIndex || !selectedVia || resolving) return;
    setResolving(true);
    setErrorKind(null);
    try {
      const res = await resolveAddressToHome(streetIndex, selectedVia, civico);
      if (res.kind === 'ok') {
        onSet(res.home);
        onClose();
      } else {
        setErrorKind(res.kind);
      }
    } catch {
      setErrorKind('fetch-failed');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[86%] rounded-t-3xl bg-parchment-100 pb-8">
          <View className="flex-row items-center justify-between px-5 pb-1 pt-5">
            <Text className="text-lg font-bold text-ink-800">Imposta indirizzo</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Chiudi">
              <Ionicons name="close" size={22} color="#8B7355" />
            </Pressable>
          </View>
          <Text className="px-5 pb-3 text-xs leading-5 text-stone-600">
            Scegli la via e il civico per posizionare la tua casa e filtrare il feed sulle voci
            vicine.
          </Text>

          {streetIndex === null ? (
            <View className="items-center py-12">
              <ActivityIndicator color="#9B2335" />
            </View>
          ) : names.length === 0 ? (
            <View className="mx-5 mb-4 flex-row items-start rounded-xl bg-white p-4">
              <Ionicons name="cloud-download-outline" size={18} color="#8B7355" />
              <Text className="ml-3 flex-1 text-sm leading-5 text-stone-600">
                {RESOLUTION_MESSAGE['empty-index']}
              </Text>
            </View>
          ) : (
            <>
              {/* Street search */}
              <View className="mx-5 mb-2 flex-row items-center rounded-xl bg-white px-3">
                <Ionicons name="search" size={16} color="#a89888" />
                <TextInput
                  value={search}
                  onChangeText={(t) => {
                    setSearch(t);
                    setSelectedVia(null);
                  }}
                  placeholder="Cerca una via…"
                  placeholderTextColor="#a89888"
                  className="ml-2 flex-1 py-2.5 text-[15px] text-ink-800"
                  accessibilityLabel="Cerca una via"
                />
              </View>

              {/* Matching streets */}
              <ScrollView
                className="mx-5 mb-3 max-h-56 rounded-xl bg-white"
                keyboardShouldPersistTaps="handled">
                {matches.length === 0 ? (
                  <Text className="px-4 py-4 text-sm text-stone-500">Nessuna via trovata.</Text>
                ) : (
                  matches.map((name, i) => {
                    const active = name === selectedVia;
                    return (
                      <Pressable
                        key={name}
                        onPress={() => setSelectedVia(name)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={`flex-row items-center justify-between px-4 py-3 ${
                          i !== matches.length - 1 ? 'border-b border-parchment-200' : ''
                        } ${active ? 'bg-brick-50' : ''}`}>
                        <Text
                          className={`flex-1 text-[15px] ${active ? 'font-semibold text-brick-700' : 'text-ink-800'}`}
                          numberOfLines={1}>
                          {name}
                        </Text>
                        {active && <Ionicons name="checkmark" size={18} color="#9B2335" />}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              {/* Civic number */}
              <View className="mx-5 mb-3">
                <Text className="mb-1.5 text-xs font-semibold text-stone-600">
                  Civico (facoltativo)
                </Text>
                <TextInput
                  value={civico}
                  onChangeText={setCivico}
                  keyboardType="number-pad"
                  placeholder="es. 24"
                  placeholderTextColor="#a89888"
                  className="rounded-xl bg-white px-4 py-2.5 text-[15px] text-ink-800"
                  accessibilityLabel="Numero civico"
                />
              </View>

              {errorKind && (
                <View className="mx-5 mb-3 flex-row items-start rounded-xl bg-brick-50 p-3">
                  <Ionicons name="alert-circle" size={16} color="#9B2335" />
                  <Text className="ml-2 flex-1 text-xs leading-5 text-brick-700">
                    {RESOLUTION_MESSAGE[errorKind]}
                  </Text>
                </View>
              )}

              {/* Confirm */}
              <Pressable
                onPress={handleSet}
                disabled={!selectedVia || resolving}
                accessibilityRole="button"
                accessibilityLabel="Imposta come casa"
                accessibilityState={{ disabled: !selectedVia || resolving }}
                className={`mx-5 flex-row items-center justify-center rounded-xl py-3.5 ${
                  !selectedVia || resolving ? 'bg-parchment-200' : 'bg-brick-600'
                }`}>
                {resolving ? (
                  <ActivityIndicator color="#fdfcfa" />
                ) : (
                  <>
                    <Ionicons name="home" size={16} color={!selectedVia ? '#a89888' : '#fdfcfa'} />
                    <Text
                      className={`ml-2 text-[15px] font-semibold ${!selectedVia ? 'text-stone-400' : 'text-white'}`}>
                      Imposta come casa
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const [zones, setZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [interests, setInterests] = useState<Set<Category>>(new Set(CATEGORIES));
  const [filingTypes, setFilingTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [notificationsOn, setNotificationsOn] = useState(false);
  // "Casa" — the home anchor + radius for the feed's "Vicino a casa" filter. The
  // anchor is set from a permit detail ("Imposta come casa"); here it is shown,
  // its radius chosen, and it can be cleared.
  const [home, setHome] = useState<HomeLocation | null>(null);
  const [homeRadius, setHomeRadius] = useState<number>(DEFAULT_HOME_RADIUS_M);
  // "Imposta indirizzo" modal — the type-your-address way to set the home anchor.
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Live "how many permits match these filters" preview + the DB total. Either is
  // null while its count is loading. `matchCount` recomputes whenever a filter set
  // changes so the impact of a toggle is visible without leaving the screen.
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // Per-zone / per-filing-type stored-permit counts, shown next to each toggle so
  // the user sees how much data a filter holds before turning it on/off.
  const [byZone, setByZone] = useState<Record<string, number>>({});
  const [byDataset, setByDataset] = useState<Record<string, number>>({});
  const [byTag, setByTag] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([loadPreferences(), isNotificationsEnabled()]).then(([prefs, notifEnabled]) => {
      setZones(new Set(prefs.zones));
      setInterests(new Set(prefs.interests));
      setFilingTypes(new Set(prefs.filingTypes));
      setTags(new Set(prefs.tags));
      setHome(prefs.home);
      setHomeRadius(prefs.homeRadiusMeters);
      setNotificationsOn(notifEnabled);
      setLoaded(true);
    });
  }, []);

  // The unfiltered DB total + per-zone / per-dataset breakdown — fetched once via
  // getStats (one pass over the table): `total` drives the match-summary card, and
  // byZone / byDataset feed the count shown on each zone / filing-type toggle.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getDb()
      .then((db) => getStats(db))
      .then((stats) => {
        if (cancelled) return;
        setTotalCount(stats.total);
        setByZone(stats.byZone);
        setByDataset(stats.byDataset);
        setByTag(stats.byTag);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  // Count of permits matching the currently-saved filters; re-runs on every toggle
  // (each toggle replaces the Set, changing the dep identity). A stale async result
  // is dropped via the cancelled flag so out-of-order counts can't flash.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setMatchCount(null);
    getDb()
      .then((db) =>
        countPermits(db, { zones: [...zones], filingTypes: [...filingTypes], tags: [...tags] })
      )
      .then((c) => {
        if (!cancelled) setMatchCount(c);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, zones, filingTypes, tags]);

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

  // At least one interest must stay on (mirrors toggleFilingType): a zero-category
  // preference set would leave the feed permanently empty. Toggling an interest off
  // does not delete stored rows — it just filters them out (cheap + reversible).
  const toggleInterest = (category: Category) => {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        if (next.size > 1) next.delete(category);
      } else {
        next.add(category);
      }
      savePreferences({ interests: [...next] });
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

  const chooseHomeRadius = (meters: number) => {
    setHomeRadius(meters);
    savePreferences({ homeRadiusMeters: meters });
  };

  // Persist a home resolved from the "Imposta indirizzo" flow. Same write path as
  // the permit-detail "Imposta come casa" anchor — this is an additive second way
  // in, not a replacement.
  const applyAddressHome = (next: HomeLocation) => {
    setHome(next);
    savePreferences({ home: next });
  };

  const clearHome = () => {
    Alert.alert('Rimuovi casa', 'La posizione di casa verrà rimossa. Continuare?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rimuovi',
        style: 'destructive',
        onPress: () => {
          setHome(null);
          savePreferences({ home: null });
        },
      },
    ]);
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
            setInterests(new Set(CATEGORIES));
            setFilingTypes(new Set(FILING_TYPE_ORDER));
            setTags(new Set());
            savePreferences({
              zones: [...QUARTIERI],
              interests: [...CATEGORIES],
              filingTypes: [...FILING_TYPE_ORDER],
              tags: [],
            });
          },
        },
      ]
    );
  };

  if (!loaded) {
    return <SettingsSkeleton />;
  }

  const tagEntries = Object.entries(TAG_LABELS);
  // Single source of truth for the app version: app.json (CFBundleShortVersionString),
  // surfaced by expo-constants — never hardcode it in the UI or it drifts on each release.
  const appVersion = Constants.expoConfig?.version ?? '';
  const summary = buildMatchSummary(matchCount, totalCount);
  // Stats (per-zone / per-filing counts) share the getStats fetch that sets the
  // DB total, so totalCount landing means the breakdown maps are populated too.
  const statsLoaded = totalCount !== null;

  // Per-category stored-permit counts, folded up from the per-dataset breakdown
  // via the SOURCES registry (byDataset is keyed by the same source keys), so the
  // interest toggles show how much data each category holds without extra queries.
  const byCategory: Partial<Record<Category, number>> = {};
  for (const [key, config] of Object.entries(SOURCES)) {
    byCategory[config.category] = (byCategory[config.category] ?? 0) + (byDataset[key] ?? 0);
  }

  return (
    <ScrollView className="flex-1 bg-parchment-100">
      {/* Live preview: how many stored permits match the filters set below. Gives
          immediate feedback on a toggle without switching to the feed tab. */}
      <View
        className="mx-4 mt-4 flex-row items-center rounded-2xl bg-white p-5"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}
        accessibilityRole="summary"
        accessibilityLabel={`${summary.number} ${summary.label}, ${summary.caption}`}>
        <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-brick-50">
          <Ionicons name="funnel" size={22} color="#9B2335" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-baseline">
            <Text className="text-3xl font-extrabold text-ink-800">{summary.number}</Text>
            <Text className="ml-2 flex-1 text-sm font-semibold text-stone-600">
              {summary.label}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-stone-600">{summary.caption}</Text>
        </View>
      </View>

      <SectionHeader
        title="Notifiche"
        hint="Controlla in background e avvisa quando ci sono nuove voci"
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

      <SectionHeader
        title="Interessi"
        hint={`${interests.size} di ${CATEGORIES.length} categorie seguite`}
      />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        {CATEGORIES.map((category, i) => (
          <ToggleRow
            key={category}
            label={CATEGORY_LABELS[category]}
            value={interests.has(category)}
            onToggle={() => toggleInterest(category)}
            isLast={i === CATEGORIES.length - 1}
            leadingColor={CATEGORY_COLORS[category].text}
            count={statsLoaded ? (byCategory[category] ?? 0) : undefined}
          />
        ))}
      </View>

      <SectionHeader
        title="Casa"
        hint="Filtra il feed per vicinanza con «Vicino a casa»; con le notifiche attive, ti avvisa quando nuove voci compaiono vicino a casa"
      />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        {home ? (
          <>
            {/* Current anchor + remove */}
            <View className="flex-row items-center border-b border-parchment-200 px-4 py-3">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-brick-50">
                <Ionicons name="home" size={17} color="#9B2335" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-stone-600">Casa impostata</Text>
                <Text className="text-[15px] font-semibold text-ink-800" numberOfLines={1}>
                  {home.label}
                </Text>
              </View>
              <Pressable
                onPress={clearHome}
                accessibilityRole="button"
                accessibilityLabel="Rimuovi casa"
                hitSlop={8}
                className="flex-row items-center rounded-full bg-parchment-100 px-3 py-1.5">
                <Ionicons name="trash-outline" size={13} color="#8B7355" />
                <Text className="ml-1 text-xs font-semibold text-stone-600">Rimuovi</Text>
              </Pressable>
            </View>
            {/* Radius picker */}
            <View className="px-4 py-3">
              <Text className="mb-2 text-xs font-semibold text-stone-600">Raggio</Text>
              <View className="flex-row flex-wrap">
                {HOME_RADIUS_OPTIONS.map((m) => {
                  const active = homeRadius === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => chooseHomeRadius(m)}
                      accessibilityRole="button"
                      accessibilityLabel={`Raggio ${formatRadiusLabel(m)}`}
                      accessibilityState={{ selected: active }}
                      className={`mb-1.5 mr-1.5 rounded-full border px-3.5 py-1.5 ${
                        active
                          ? 'border-brick-600 bg-brick-50'
                          : 'border-transparent bg-parchment-100'
                      }`}>
                      <Text
                        className={`text-xs font-semibold ${active ? 'text-brick-700' : 'text-stone-500'}`}>
                        {formatRadiusLabel(m)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {/* Surface the P4 place-aware alert: with a home set AND notifications
                on, the background push is already radius-scoped ("N pratiche vicino
                a casa"). Tell the user so the shipped capability is discoverable —
                stated in their own radius terms, only when it will actually fire. */}
            {homeAlertCaption(home, notificationsOn, homeRadius) !== null && (
              <View className="flex-row items-start border-t border-parchment-200 px-4 py-3">
                <Ionicons name="notifications" size={15} color="#9B2335" style={{ marginTop: 1 }} />
                <Text className="ml-2 flex-1 text-xs leading-5 text-stone-600">
                  {homeAlertCaption(home, notificationsOn, homeRadius)}
                </Text>
              </View>
            )}
          </>
        ) : (
          // No anchor yet: teach the two ways to set it — type an address here, or
          // tap "Imposta come casa" on any permit that carries a coordinate.
          <View className="flex-row items-start px-4 py-4">
            <View className="mr-3 mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-parchment-100">
              <Ionicons name="home-outline" size={17} color="#8B7355" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-ink-800">Nessuna casa impostata</Text>
              <Text className="mt-0.5 text-xs leading-5 text-stone-500">
                Imposta il tuo indirizzo qui sotto, oppure apri una voce e tocca «Imposta come
                casa».
              </Text>
            </View>
          </View>
        )}
        {/* "Imposta indirizzo" — the type-an-address entry (second way to set the
            anchor). Always available: sets a first home, or changes an existing one. */}
        <Pressable
          onPress={() => setAddressModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Imposta indirizzo"
          className="flex-row items-center border-t border-parchment-200 px-4 py-3">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-brick-50">
            <Ionicons name="location" size={17} color="#9B2335" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-ink-800">
              {home ? 'Cambia indirizzo' : 'Imposta indirizzo'}
            </Text>
            <Text className="mt-0.5 text-xs text-stone-500">Cerca la tua via e il civico</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#a89888" />
        </Pressable>
      </View>
      <AddressModal
        visible={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSet={applyAddressHome}
      />

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
            count={statsLoaded ? (byZone[zone] ?? 0) : undefined}
          />
        ))}
      </View>

      <SectionHeader
        title="Tipo di Pratica"
        hint={`Solo per Edilizia · ${filingTypes.size} di ${FILING_TYPE_ORDER.length} attivi`}
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
            leadingColor={FILING_COLORS[type].text}
            count={statsLoaded ? (byDataset[FILING_DATASET_KEY[type]] ?? 0) : undefined}
          />
        ))}
      </View>

      <SectionHeader title="Filtri Etichette" hint="Mostra solo voci con queste etichette" />
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
            count={statsLoaded ? (byTag[tag] ?? 0) : undefined}
          />
        ))}
      </View>

      <View className="p-4">
        <Pressable
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel="Ripristina predefiniti"
          accessibilityHint="Reimposta tutti i filtri ai valori predefiniti"
          className="items-center rounded-xl border border-stone-300 bg-white py-3">
          <Text className="font-semibold text-stone-600">Ripristina Predefiniti</Text>
        </Pressable>
      </View>

      <SectionHeader title="Informazioni" />
      <View
        className="mx-4 overflow-hidden rounded-xl bg-white"
        style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        {/* App identity — brand mark, name, version (single source: app.json) */}
        <View className="flex-row items-center border-b border-parchment-200 px-4 py-4">
          <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-brick-600">
            <CivicoMark size={24} color="#F5F0E8" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-ink-800">{APP_NAME}</Text>
            <Text className="text-xs text-stone-500">
              {appVersion ? `Versione ${appVersion}` : `Dati aperti del ${CITY.provider}`}
            </Text>
          </View>
        </View>

        {/* On-device privacy — the app's core promise, worth stating plainly */}
        <View className="flex-row items-start border-b border-parchment-200 px-4 py-3">
          <View className="mr-3 mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-brick-50">
            <Ionicons name="lock-closed-outline" size={17} color="#9B2335" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-ink-800">
              Tutto sul tuo dispositivo
            </Text>
            <Text className="mt-0.5 text-xs leading-5 text-stone-500">
              Nessun account, nessun tracciamento. I dati restano solo sul telefono.
            </Text>
          </View>
        </View>

        {/* Attribution — CC BY 4.0 requires crediting the source; both tappable */}
        <InfoLinkRow
          icon="globe-outline"
          label="Portale Open Data"
          sublabel="opendata.comune.bologna.it"
          url={OPEN_DATA_PORTAL_URL}
        />
        <InfoLinkRow
          icon="document-text-outline"
          label="Licenza dati"
          sublabel="Creative Commons BY 4.0"
          url={DATA_LICENSE_URL}
          isLast
        />
      </View>

      <View className="h-10" />
    </ScrollView>
  );
}
