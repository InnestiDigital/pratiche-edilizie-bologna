import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../../lib/db';
import {
  getPermits,
  countPermits,
  countNewPermits,
  markAllSeen,
  parsePermitTags,
  SORT_LABELS,
  type Permit,
  type FeedFilters,
  type SortOption,
} from '../../lib/queries';
import { loadPreferences } from '../../lib/preferences';
import { listFavoriteIds, toggleFavorite } from '../../lib/favorites';
import { applyFavoriteToggle } from '../../lib/favorite-set';
import { feedCardDate } from '../../lib/feed-card-date';
import { parseZoneParam } from '../../lib/zone-param';
import { groupPermitsBySection } from '../../lib/feed-sections';
import { formatSearchTerm } from '../../lib/search-empty-message';
import { formatProtocol } from '../../lib/format-protocol';
import {
  buildActiveFilterChips,
  ZONES_CHIP_KEY,
  PERIOD_CHIP_KEY,
  ONLY_NEW_CHIP_KEY,
  ONLY_FAVORITES_CHIP_KEY,
  SORT_CHIP_KEY,
  STATUS_CHIP_PREFIX,
  TAG_CHIP_PREFIX,
} from '../../lib/active-filters';
import {
  periodStartDate,
  FEED_PERIOD_ORDER,
  PERIOD_LABELS,
  type FeedPeriod,
} from '../../lib/feed-period';
import { PermitFeedSkeleton } from '../../components/PermitSkeleton';
import { FadeScrollRow } from '../../components/FadeScrollRow';
import {
  FILING_TYPE_ORDER,
  FILING_COLORS,
  STATUS_LABELS,
  TAG_LABELS,
  QUARTIERI,
  type FilingType,
  type Quartiere,
} from '../../lib/constants';

/* ── Colors ─────────────────────────────────────── */

const STATUS_DOT: Record<string, string> = {
  rilasciata: '#22c55e',
  rilasciata_con_prescrizioni: '#eab308',
  diniegata: '#ef4444',
  annullata: '#ef4444',
  archiviata: '#9ca3af',
  decaduta: '#9ca3af',
  rinunciata: '#9ca3af',
  in_attesa: '#3b82f6',
  concluso: '#22c55e',
};

const STATUS_KEYS = Object.keys(STATUS_LABELS);
const TAG_KEYS = Object.keys(TAG_LABELS);

/* ── Tag Badge ──────────────────────────────────── */

function TagBadge({ tag }: { tag: string }) {
  return (
    <View className="mr-1 mt-1 rounded-full bg-parchment-200 px-2.5 py-0.5">
      <Text className="text-xs font-medium text-stone-600">{TAG_LABELS[tag] ?? tag}</Text>
    </View>
  );
}

/* ── Permit Card ────────────────────────────────── */

function PermitCard({
  permit,
  isSaved,
  sort,
  onPress,
  onToggleSave,
}: {
  permit: Permit;
  isSaved: boolean;
  sort: SortOption;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const tags = parsePermitTags(permit.tags);
  const statusLabel = STATUS_LABELS[permit.status] ?? permit.status_raw;
  const dotColor = STATUS_DOT[permit.status] ?? '#9ca3af';
  const fc = FILING_COLORS[permit.filing_type as FilingType] ?? FILING_COLORS.PDC;
  // Date shown in the footer, chosen + labelled to match the active sort so the
  // card never displays a date that disagrees with how the feed is ordered.
  const cardDate = feedCardDate(permit, sort);

  const a11yLabel = [
    permit.filing_type,
    statusLabel,
    permit.is_new === 1 ? 'nuovo' : null,
    isSaved ? 'salvata' : null,
    permit.address ?? 'Indirizzo non disponibile',
    permit.zone,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Apri i dettagli della pratica"
      className="mx-4 mb-2.5 rounded-xl bg-white p-4"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      }}>
      {/* Top row: badges */}
      <View className="mb-2 flex-row items-center">
        <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: fc.bg }}>
          <Text className="text-xs font-bold" style={{ color: fc.text }}>
            {permit.filing_type}
          </Text>
        </View>
        <View className="ml-2 flex-row items-center">
          <View className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
          <Text className="text-xs font-medium text-stone-500">{statusLabel}</Text>
        </View>
        <View className="ml-auto flex-row items-center">
          {permit.is_new === 1 && (
            <View className="mr-2 rounded-full bg-brick-600 px-2.5 py-0.5">
              <Text className="text-[10px] font-bold text-white">NUOVO</Text>
            </View>
          )}
          {/* Quick-save: toggle the bookmark straight from the feed, no need to
              open the detail. Nested Pressable captures the tap so the card's
              own onPress (navigate) does not also fire. */}
          <Pressable
            onPress={onToggleSave}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Rimuovi dai salvati' : 'Salva pratica'}
            accessibilityState={{ selected: isSaved }}>
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isSaved ? '#9B2335' : '#a89888'}
            />
          </Pressable>
        </View>
      </View>

      {/* Address */}
      <Text className="text-[15px] font-semibold leading-5 text-ink-800" numberOfLines={2}>
        {permit.address ?? 'Indirizzo non disponibile'}
      </Text>

      {/* Zone */}
      {permit.zone && <Text className="mt-0.5 text-sm text-stone-500">{permit.zone}</Text>}

      {/* Procedimento */}
      {permit.procedimento && (
        <Text className="mt-1 text-sm leading-5 text-ink-500" numberOfLines={2}>
          {permit.procedimento}
        </Text>
      )}

      {/* Footer: date (labelled to match the active sort) + protocol */}
      <View className="mt-2 flex-row items-center">
        {cardDate && (
          <View className="mr-3 flex-row items-center">
            <Ionicons
              name={cardDate.icon as keyof typeof Ionicons.glyphMap}
              size={12}
              color="#70593f"
            />
            <Text className="ml-1 text-xs text-stone-600">
              <Text className="font-semibold">{cardDate.label}</Text> {cardDate.date}
            </Text>
          </View>
        )}
        <View className="flex-row items-center">
          <Ionicons name="document-outline" size={12} color="#70593f" />
          <Text className="ml-1 text-xs text-stone-600">{formatProtocol(permit.source_id)}</Text>
        </View>
      </View>

      {/* Tags */}
      {tags.length > 0 && (
        <View className="mt-1.5 flex-row flex-wrap">
          {tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

/* ── Empty States ───────────────────────────────── */

function EmptyDataState() {
  const router = useRouter();
  return (
    <View
      className="mx-6 mt-16 items-center rounded-2xl bg-white p-8"
      style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brick-50">
        <Ionicons name="cloud-download-outline" size={28} color="#9B2335" />
      </View>
      <Text className="text-lg font-bold text-ink-800">Nessun dato</Text>
      <Text className="mt-1 text-center text-sm text-stone-500">
        Scarica le pratiche dalla scheda Aggiorna.
      </Text>
      <Pressable
        onPress={() => router.push('/(tabs)/sync')}
        accessibilityRole="button"
        accessibilityLabel="Vai ad Aggiorna"
        className="mt-4 flex-row items-center rounded-xl bg-brick-600 px-5 py-3">
        <Ionicons name="cloud-download-outline" size={16} color="white" />
        <Text className="ml-2 font-bold text-white">Vai ad Aggiorna</Text>
      </Pressable>
    </View>
  );
}

function EmptySavedState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <View
      className="mx-6 mt-16 items-center rounded-2xl bg-white p-8"
      style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brick-50">
        <Ionicons name="bookmark-outline" size={28} color="#9B2335" />
      </View>
      <Text className="text-lg font-bold text-ink-800">Nessuna pratica salvata</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-stone-500">
        Tocca il segnalibro <Ionicons name="bookmark-outline" size={13} color="#8B7355" /> su una
        pratica per salvarla e ritrovarla qui.
      </Text>
      <Pressable
        onPress={onShowAll}
        accessibilityRole="button"
        accessibilityLabel="Mostra tutte le pratiche"
        className="mt-4 rounded-xl bg-parchment-200 px-5 py-2.5">
        <Text className="font-semibold text-stone-600">Mostra tutte le pratiche</Text>
      </Pressable>
    </View>
  );
}

function EmptySearchState({ term, onClearSearch }: { term: string; onClearSearch: () => void }) {
  return (
    <View
      className="mx-6 mt-16 items-center rounded-2xl bg-white p-8"
      style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brick-50">
        <Ionicons name="search-outline" size={28} color="#9B2335" />
      </View>
      <Text className="text-lg font-bold text-ink-800">Nessun risultato</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-stone-500">
        Nessuna pratica corrisponde a «{term}». Controlla l’ortografia o prova un altro termine.
      </Text>
      <Pressable
        onPress={onClearSearch}
        accessibilityRole="button"
        accessibilityLabel="Cancella ricerca"
        className="mt-4 rounded-xl bg-parchment-200 px-5 py-2.5">
        <Text className="font-semibold text-stone-600">Cancella ricerca</Text>
      </Pressable>
    </View>
  );
}

function EmptyFilterState({ onReset }: { onReset: () => void }) {
  return (
    <View
      className="mx-6 mt-16 items-center rounded-2xl bg-white p-8"
      style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      <Ionicons name="filter-outline" size={36} color="#a89888" />
      <Text className="mt-3 text-base font-semibold text-ink-700">Nessun risultato</Text>
      <Text className="mt-1 text-sm text-stone-500">Prova a modificare i filtri o la ricerca.</Text>
      <Pressable
        onPress={onReset}
        accessibilityRole="button"
        accessibilityLabel="Resetta filtri"
        className="mt-4 rounded-xl bg-parchment-200 px-5 py-2.5">
        <Text className="font-semibold text-stone-600">Resetta filtri</Text>
      </Pressable>
    </View>
  );
}

/* ── Filter Panel ───────────────────────────────── */

const SORT_OPTIONS: SortOption[] = [
  'request_newest',
  'request_oldest',
  'closing_newest',
  'newest',
  'oldest',
];

function FilterPanel({
  activeZones,
  toggleZone,
  activeStatuses,
  toggleStatus,
  activeTags,
  toggleTag,
  onlyNew,
  toggleOnlyNew,
  onlyFavorites,
  toggleOnlyFavorites,
  period,
  setPeriod,
  sort,
  setSort,
}: {
  activeZones: Set<Quartiere>;
  toggleZone: (z: Quartiere) => void;
  activeStatuses: Set<string>;
  toggleStatus: (s: string) => void;
  activeTags: Set<string>;
  toggleTag: (t: string) => void;
  onlyNew: boolean;
  toggleOnlyNew: () => void;
  onlyFavorites: boolean;
  toggleOnlyFavorites: () => void;
  period: FeedPeriod;
  setPeriod: (p: FeedPeriod) => void;
  sort: SortOption;
  setSort: (s: SortOption) => void;
}) {
  return (
    <View className="border-b border-stone-200 bg-white px-4 pb-3">
      {/* Quick toggles: only new / only saved */}
      <View className="mb-3 flex-row">
        <Pressable
          onPress={toggleOnlyNew}
          accessibilityRole="button"
          accessibilityLabel="Solo nuovi"
          accessibilityState={{ selected: onlyNew }}
          className={`mr-2 flex-row items-center self-start rounded-full px-3.5 py-2 ${
            onlyNew ? 'bg-brick-600' : 'bg-parchment-100'
          }`}>
          <Ionicons name="sparkles" size={14} color={onlyNew ? 'white' : '#8B7355'} />
          <Text
            className={`ml-1.5 text-xs font-semibold ${onlyNew ? 'text-white' : 'text-stone-500'}`}>
            Solo nuovi
          </Text>
        </Pressable>
        <Pressable
          onPress={toggleOnlyFavorites}
          accessibilityRole="button"
          accessibilityLabel="Solo salvate"
          accessibilityState={{ selected: onlyFavorites }}
          className={`flex-row items-center self-start rounded-full px-3.5 py-2 ${
            onlyFavorites ? 'bg-brick-600' : 'bg-parchment-100'
          }`}>
          <Ionicons
            name={onlyFavorites ? 'bookmark' : 'bookmark-outline'}
            size={14}
            color={onlyFavorites ? 'white' : '#8B7355'}
          />
          <Text
            className={`ml-1.5 text-xs font-semibold ${onlyFavorites ? 'text-white' : 'text-stone-500'}`}>
            Solo salvate
          </Text>
        </Pressable>
      </View>

      {/* Period (request date) */}
      <Text className="mb-1.5 text-xs font-semibold text-stone-600">Periodo (richiesta)</Text>
      <FadeScrollRow className="mb-3">
        {FEED_PERIOD_ORDER.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            accessibilityRole="button"
            accessibilityLabel={`Periodo ${PERIOD_LABELS[p]}`}
            accessibilityState={{ selected: period === p }}
            className={`mr-2 rounded-full px-3.5 py-1.5 ${
              period === p ? 'bg-brick-600' : 'bg-parchment-100'
            }`}>
            <Text
              className={`text-xs font-semibold ${period === p ? 'text-white' : 'text-stone-500'}`}>
              {PERIOD_LABELS[p]}
            </Text>
          </Pressable>
        ))}
      </FadeScrollRow>

      {/* Sort */}
      <Text className="mb-1.5 text-xs font-semibold text-stone-600">Ordina per</Text>
      <FadeScrollRow className="mb-3">
        {SORT_OPTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSort(s)}
            accessibilityRole="button"
            accessibilityLabel={`Ordina per ${SORT_LABELS[s]}`}
            accessibilityState={{ selected: sort === s }}
            className={`mr-2 rounded-full px-3.5 py-1.5 ${
              sort === s ? 'bg-brick-600' : 'bg-parchment-100'
            }`}>
            <Text
              className={`text-xs font-semibold ${sort === s ? 'text-white' : 'text-stone-500'}`}>
              {SORT_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </FadeScrollRow>

      {/* Zone chips */}
      <Text className="mb-1.5 text-xs font-semibold text-stone-600">Quartiere</Text>
      <View className="mb-3 flex-row flex-wrap">
        {QUARTIERI.map((zone) => (
          <Pressable
            key={zone}
            onPress={() => toggleZone(zone)}
            accessibilityRole="button"
            accessibilityLabel={`Quartiere ${zone}`}
            accessibilityState={{ selected: activeZones.has(zone) }}
            className={`mb-1.5 mr-1.5 rounded-full px-3 py-1.5 ${
              activeZones.has(zone) ? 'bg-brick-600' : 'bg-parchment-100'
            }`}>
            <Text
              className={`text-xs font-semibold ${activeZones.has(zone) ? 'text-white' : 'text-stone-500'}`}>
              {zone}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Status chips */}
      <Text className="mb-1.5 text-xs font-semibold text-stone-600">Stato</Text>
      <View className="flex-row flex-wrap">
        {STATUS_KEYS.map((s) => {
          const active = activeStatuses.has(s);
          const dot = STATUS_DOT[s] ?? '#9ca3af';
          return (
            <Pressable
              key={s}
              onPress={() => toggleStatus(s)}
              accessibilityRole="button"
              accessibilityLabel={`Stato ${STATUS_LABELS[s]}`}
              accessibilityState={{ selected: active }}
              className={`mb-1.5 mr-1.5 flex-row items-center rounded-full px-3 py-1.5 ${
                active ? 'bg-ink-800' : 'bg-parchment-100'
              }`}>
              <View
                className="mr-1.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? 'white' : dot }}
              />
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-stone-500'}`}>
                {STATUS_LABELS[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tag chips */}
      <Text className="mb-1.5 mt-3 text-xs font-semibold text-stone-600">Etichette</Text>
      <View className="flex-row flex-wrap">
        {TAG_KEYS.map((t) => {
          const active = activeTags.has(t);
          return (
            <Pressable
              key={t}
              onPress={() => toggleTag(t)}
              accessibilityRole="button"
              accessibilityLabel={`Etichetta ${TAG_LABELS[t]}`}
              accessibilityState={{ selected: active }}
              className={`mb-1.5 mr-1.5 rounded-full px-3 py-1.5 ${
                active ? 'bg-brick-600' : 'bg-parchment-100'
              }`}>
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-stone-500'}`}>
                {TAG_LABELS[t]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ── Active Filter Chips ────────────────────────── */

function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: { key: string; label: string }[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  return (
    <View className="bg-white pb-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}>
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            onPress={() => onRemove(chip.key)}
            accessibilityRole="button"
            accessibilityLabel={`Rimuovi filtro ${chip.label}`}
            className="mr-2 flex-row items-center rounded-full bg-brick-50 py-1.5 pl-3.5 pr-2.5">
            <Text className="text-xs font-semibold text-brick-600">{chip.label}</Text>
            <Ionicons name="close" size={13} color="#9B2335" style={{ marginLeft: 4 }} />
          </Pressable>
        ))}
        <Pressable
          onPress={onClearAll}
          accessibilityRole="button"
          accessibilityLabel="Cancella tutti i filtri"
          className="mr-4 flex-row items-center rounded-full border border-stone-300 px-3.5 py-1.5">
          <Text className="text-xs font-semibold text-stone-600">Cancella</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ── Date Section Header ────────────────────────── */

/** Sticky month header ("Novembre 2024") over a run of same-month cards. */
function FeedSectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View className="flex-row items-center justify-between bg-parchment-100 px-4 pb-1.5 pt-3">
      <Text
        className="text-xs font-bold uppercase tracking-wider text-stone-600"
        accessibilityRole="header">
        {title}
      </Text>
      <Text className="text-xs font-semibold text-stone-500">{count}</Text>
    </View>
  );
}

/* ── Main Feed Screen ───────────────────────────── */

export default function FeedScreen() {
  const router = useRouter();
  // Deep link from the Sync "Per Quartiere" rows: `?zone=<quartiere>&t=<nonce>`.
  // The nonce lets tapping the SAME zone twice re-apply the filter (the param
  // value changes, so the effect below refires even when `zone` is unchanged).
  // Deep link from the detail "Altre pratiche in <via>" action carries `q` (a
  // street name) + the shared `t` nonce; it prefills the search box below.
  const {
    zone: zoneParam,
    q: searchParam,
    t: linkNonce,
  } = useLocalSearchParams<{ zone?: string; q?: string; t?: string }>();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [activeTypes, setActiveTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  const [activeZones, setActiveZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [period, setPeriod] = useState<FeedPeriod>('all');
  const [sort, setSort] = useState<SortOption>('request_newest');
  const [search, setSearch] = useState('');
  const offsetRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);

  const activeFilterCount =
    (activeZones.size < QUARTIERI.length ? 1 : 0) +
    (period !== 'all' ? 1 : 0) +
    (activeStatuses.size > 0 ? 1 : 0) +
    (activeTags.size > 0 ? 1 : 0) +
    (onlyNew ? 1 : 0) +
    (onlyFavorites ? 1 : 0) +
    (sort !== 'request_newest' ? 1 : 0);

  const loadPermits = useCallback(
    async (reset = false) => {
      const db = await getDb();
      const prefs = await loadPreferences();
      const newOffset = reset ? 0 : offsetRef.current;

      const filters: FeedFilters = {
        zones: activeZones.size < QUARTIERI.length ? [...activeZones] : prefs.zones,
        filingTypes: [...activeTypes].filter((t) => prefs.filingTypes.includes(t)),
        // In-feed tag chips override the persistent settings tag filter for this
        // session; fall back to prefs.tags when no chip is active (mirrors zones).
        tags: activeTags.size > 0 ? [...activeTags] : prefs.tags,
        searchQuery: search || undefined,
        statuses: activeStatuses.size > 0 ? [...activeStatuses] : undefined,
        onlyNew: onlyNew || undefined,
        onlyFavorites: onlyFavorites || undefined,
        // Time-period filter → a request-date lower bound; `new Date()` is the
        // real current time (the clock read lives here, not in the pure helper),
        // and 'all' yields null → undefined (no bound).
        requestedAfter: periodStartDate(period, new Date()) ?? undefined,
        sort,
      };

      if (reset) {
        const allFilters: FeedFilters = {
          zones: prefs.zones,
          filingTypes: prefs.filingTypes,
          tags: [],
        };
        const checkRows = await getPermits(db, allFilters, 1, 0);
        setHasData(checkRows.length > 0);
        // Total matching the active filters (pagination-independent) for the
        // result-count header; shares getPermits' WHERE so the number is exact.
        setResultCount(await countPermits(db, filters));
        // New (unseen) permits across the whole DB — drives the "mark all seen"
        // action; global, matching markAllSeen's global UPDATE.
        setNewCount(await countNewPermits(db));
        // Saved-permit ids, so each card can render its bookmark from one query
        // instead of an isFavorite call per visible row.
        setFavoriteIds(await listFavoriteIds(db));
      }

      const rows = await getPermits(db, filters, 50, newOffset);
      if (reset) {
        setPermits(rows);
        offsetRef.current = 50;
      } else {
        setPermits((prev) => [...prev, ...rows]);
        offsetRef.current = newOffset + 50;
      }
      setHasMore(rows.length === 50);
      setLoading(false);
    },
    [
      activeTypes,
      activeZones,
      activeStatuses,
      activeTags,
      onlyNew,
      onlyFavorites,
      period,
      sort,
      search,
    ]
  );

  useEffect(() => {
    loadPermits(true);
  }, [loadPermits]);

  // Apply a `zone` deep link from the Sync screen: narrow the feed to that single
  // quartiere. Guarded by parseZoneParam so a junk/legacy value is ignored rather
  // than filtering the feed to nothing; refires on the nonce so re-tapping works.
  useEffect(() => {
    const zone = parseZoneParam(zoneParam);
    if (zone) setActiveZones(new Set([zone]));
    // linkNonce is listed only to retrigger this effect on a same-zone re-tap.
  }, [zoneParam, linkNonce]);

  // Apply a `q` deep link from a permit detail's "Altre pratiche in <via>"
  // action: prefill the search box with the street name so the feed narrows to
  // that street. Ignored when blank; refires on the nonce so re-tapping works.
  useEffect(() => {
    if (typeof searchParam === 'string' && searchParam.trim()) setSearch(searchParam);
  }, [searchParam, linkNonce]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPermits(true);
    setRefreshing(false);
  }, [loadPermits]);

  const handleMarkAllSeen = useCallback(async () => {
    const db = await getDb();
    await markAllSeen(db);
    await loadPermits(true);
  }, [loadPermits]);

  // Save / unsave a permit straight from its feed card. Writes the DB, then folds
  // the resulting state into the local favorite-id set so the tapped card's
  // bookmark flips at once (no feed reload). A card unsaved while "Solo salvate"
  // is active stays visible until the next reload — less jarring than vanishing
  // under the finger, and the bookmark still reflects the new state.
  const handleToggleSave = useCallback(async (sourceId: string) => {
    const db = await getDb();
    const nowSaved = await toggleFavorite(db, sourceId, new Date().toISOString());
    setFavoriteIds((prev) => applyFavoriteToggle(prev, sourceId, nowSaved));
  }, []);

  const toggleType = (type: FilingType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleZone = (zone: Quartiere) => {
    setActiveZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  };

  const toggleStatus = (status: string) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const resetFilters = () => {
    setActiveTypes(new Set(FILING_TYPE_ORDER));
    setActiveZones(new Set(QUARTIERI));
    setActiveStatuses(new Set());
    setActiveTags(new Set());
    setOnlyNew(false);
    setOnlyFavorites(false);
    setPeriod('all');
    setSort('request_newest');
    setSearch('');
  };

  // Glanceable summary of the active filters (built from a tested pure core), so
  // the state hidden behind the collapsed panel is visible and one-tap removable.
  const activeChips = buildActiveFilterChips({
    zones: [...activeZones],
    totalZones: QUARTIERI.length,
    period,
    defaultPeriod: 'all',
    statuses: [...activeStatuses],
    tags: [...activeTags],
    onlyNew,
    onlyFavorites,
    sort,
    defaultSort: 'request_newest',
  });

  // Partition the loaded permits into calendar-month sections keyed on the active
  // sort's date field, so the feed reads as a scannable timeline. Adjacent-run
  // grouping never reorders — it mirrors the SQL order and only inserts headers.
  const sections = useMemo(() => groupPermitsBySection(permits, sort), [permits, sort]);

  // Cleaned-up echo of the search term for the "no results" empty state; null
  // when no search is active, so an empty feed with only filters set still falls
  // through to the generic filter empty-state below.
  const searchTermForEmpty = formatSearchTerm(search);

  const removeFilter = (key: string) => {
    if (key === ZONES_CHIP_KEY) setActiveZones(new Set(QUARTIERI));
    else if (key === PERIOD_CHIP_KEY) setPeriod('all');
    else if (key === ONLY_NEW_CHIP_KEY) setOnlyNew(false);
    else if (key === ONLY_FAVORITES_CHIP_KEY) setOnlyFavorites(false);
    else if (key === SORT_CHIP_KEY) setSort('request_newest');
    else if (key.startsWith(STATUS_CHIP_PREFIX)) toggleStatus(key.slice(STATUS_CHIP_PREFIX.length));
    else if (key.startsWith(TAG_CHIP_PREFIX)) toggleTag(key.slice(TAG_CHIP_PREFIX.length));
  };

  return (
    <View className="flex-1 bg-parchment-100">
      {/* Search bar + filter button */}
      <View className="flex-row items-center bg-white px-4 pb-2 pt-2">
        <TextInput
          className="flex-1 rounded-lg bg-parchment-100 px-4 py-2.5 text-base text-ink-800"
          placeholder="Cerca indirizzo o protocollo..."
          placeholderTextColor="#a89888"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          accessibilityLabel="Cerca indirizzo, procedimento o protocollo"
        />
        <Pressable
          onPress={() => setFiltersOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0 ? `Filtri, ${activeFilterCount} attivi` : 'Filtri'
          }
          accessibilityState={{ expanded: filtersOpen }}
          className={`ml-2 h-10 w-10 items-center justify-center rounded-lg ${
            filtersOpen ? 'bg-brick-600' : 'bg-parchment-100'
          }`}>
          <Ionicons name="options-outline" size={20} color={filtersOpen ? 'white' : '#8B7355'} />
          {activeFilterCount > 0 && !filtersOpen && (
            <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full bg-brick-600">
              <Text className="text-[10px] font-bold text-white">{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Filing type chips — always visible */}
      <View className="flex-row bg-white px-4 pb-3 pt-1">
        {FILING_TYPE_ORDER.map((type) => {
          const active = activeTypes.has(type);
          const fc = FILING_COLORS[type];
          return (
            <Pressable
              key={type}
              onPress={() => toggleType(type)}
              accessibilityRole="button"
              accessibilityLabel={`Tipo pratica ${type}`}
              accessibilityState={{ selected: active }}
              className={`mr-2 rounded-full px-4 py-2 ${active ? '' : 'bg-parchment-100'}`}
              style={active ? { backgroundColor: fc.bg } : undefined}>
              <Text
                className={`text-sm font-bold ${active ? '' : 'text-stone-500'}`}
                style={active ? { color: fc.text } : undefined}>
                {type}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Active-filter summary — visible when the panel is collapsed */}
      {!filtersOpen && activeChips.length > 0 && (
        <ActiveFilterChips chips={activeChips} onRemove={removeFilter} onClearAll={resetFilters} />
      )}

      {/* Expandable filter panel */}
      {filtersOpen && (
        <FilterPanel
          activeZones={activeZones}
          toggleZone={toggleZone}
          activeStatuses={activeStatuses}
          toggleStatus={toggleStatus}
          activeTags={activeTags}
          toggleTag={toggleTag}
          onlyNew={onlyNew}
          toggleOnlyNew={() => setOnlyNew((v) => !v)}
          onlyFavorites={onlyFavorites}
          toggleOnlyFavorites={() => setOnlyFavorites((v) => !v)}
          period={period}
          setPeriod={setPeriod}
          sort={sort}
          setSort={setSort}
        />
      )}

      {/* Result count — reflects the active filters + search */}
      {!loading && hasData && resultCount !== null && (
        <View className="flex-row items-center bg-parchment-100 px-4 pb-1 pt-2.5">
          <Text
            className="text-xs font-semibold text-stone-600"
            accessibilityRole="header"
            accessibilityLabel={`${resultCount} ${resultCount === 1 ? 'pratica' : 'pratiche'}`}>
            {resultCount.toLocaleString('it-IT')} {resultCount === 1 ? 'pratica' : 'pratiche'}
          </Text>
          {/* Mark-all-seen — clears the NUOVO badges when unseen permits exist */}
          {newCount > 0 && (
            <Pressable
              onPress={handleMarkAllSeen}
              accessibilityRole="button"
              accessibilityLabel={`Segna ${newCount} ${newCount === 1 ? 'pratica' : 'pratiche'} come ${newCount === 1 ? 'letta' : 'lette'}`}
              className="ml-auto flex-row items-center rounded-full bg-brick-50 px-3 py-1">
              <Ionicons name="checkmark-done" size={13} color="#9B2335" />
              <Text className="ml-1 text-xs font-semibold text-brick-600">Segna lette</Text>
            </Pressable>
          )}
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.source_id}
        renderItem={({ item }) => (
          <PermitCard
            permit={item}
            isSaved={favoriteIds.has(item.source_id)}
            sort={sort}
            onPress={() => router.push(`/permit/${item.id}`)}
            onToggleSave={() => handleToggleSave(item.source_id)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <FeedSectionHeader title={section.title} count={section.data.length} />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B2335" />
        }
        onEndReached={() => hasMore && loadPermits(false)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? (
            <PermitFeedSkeleton />
          ) : !hasData ? (
            <EmptyDataState />
          ) : onlyFavorites && favoriteIds.size === 0 ? (
            // "Solo salvate" is on but nothing is saved yet: the generic filter
            // empty-state ("modifica i filtri") misleads — there is nothing to
            // adjust. Teach the bookmark gesture + offer a one-tap way out.
            <EmptySavedState onShowAll={() => setOnlyFavorites(false)} />
          ) : searchTermForEmpty ? (
            // A search is active and matched nothing: point at the likely culprit
            // (the query) and offer to clear ONLY the search, so the user's
            // carefully-set zone/type/tag filters survive.
            <EmptySearchState term={searchTermForEmpty} onClearSearch={() => setSearch('')} />
          ) : (
            <EmptyFilterState onReset={resetFilters} />
          )
        }
      />
    </View>
  );
}
