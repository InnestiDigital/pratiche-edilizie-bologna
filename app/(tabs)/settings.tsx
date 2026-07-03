import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, Alert, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { TowersMark } from '../../components/TowersMark';
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
  loadPreferences,
  savePreferences,
  isNotificationsEnabled,
  setNotificationsEnabled,
} from '../../lib/preferences';
import { requestNotificationPermissions } from '../../lib/notifications';
import { registerBackgroundSync, unregisterBackgroundSync } from '../../lib/background-sync';
import { getDb } from '../../lib/db';
import { countPermits, getStats } from '../../lib/queries';
import { buildMatchSummary } from '../../lib/settings-match-summary';

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
  const a11yLabel = count === undefined ? label : `${label}, ${count} pratiche`;
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
  // Live "how many permits match these filters" preview + the DB total. Either is
  // null while its count is loading. `matchCount` recomputes whenever a filter set
  // changes so the impact of a toggle is visible without leaving the screen.
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // Per-zone / per-filing-type stored-permit counts, shown next to each toggle so
  // the user sees how much data a filter holds before turning it on/off.
  const [byZone, setByZone] = useState<Record<string, number>>({});
  const [byDataset, setByDataset] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([loadPreferences(), isNotificationsEnabled()]).then(([prefs, notifEnabled]) => {
      setZones(new Set(prefs.zones));
      setFilingTypes(new Set(prefs.filingTypes));
      setTags(new Set(prefs.tags));
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
        <Text className="text-stone-600">Caricamento...</Text>
      </View>
    );
  }

  const tagEntries = Object.entries(TAG_LABELS);
  // Single source of truth for the app version: app.json (CFBundleShortVersionString),
  // surfaced by expo-constants — never hardcode it in the UI or it drifts on each release.
  const appVersion = Constants.expoConfig?.version ?? '';
  const summary = buildMatchSummary(matchCount, totalCount);
  // Stats (per-zone / per-filing counts) share the getStats fetch that sets the
  // DB total, so totalCount landing means the breakdown maps are populated too.
  const statsLoaded = totalCount !== null;

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
            count={statsLoaded ? (byZone[zone] ?? 0) : undefined}
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
            leadingColor={FILING_COLORS[type].text}
            count={statsLoaded ? (byDataset[FILING_DATASET_KEY[type]] ?? 0) : undefined}
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
            <TowersMark size={24} color="#F5F0E8" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-ink-800">Pratiche Edilizie Bologna</Text>
            <Text className="text-xs text-stone-500">
              {appVersion ? `Versione ${appVersion}` : 'Dati aperti del Comune di Bologna'}
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
