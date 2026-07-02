import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../../lib/db';
import {
  getPermits,
  countPermits,
  parsePermitTags,
  SORT_LABELS,
  type Permit,
  type FeedFilters,
  type SortOption,
} from '../../lib/queries';
import { loadPreferences } from '../../lib/preferences';
import { formatItDate } from '../../lib/format-date';
import { formatProtocol } from '../../lib/format-protocol';
import {
  FILING_TYPE_ORDER,
  STATUS_LABELS,
  TAG_LABELS,
  QUARTIERI,
  type FilingType,
  type Quartiere,
} from '../../lib/constants';

/* ── Colors ─────────────────────────────────────── */

const FILING_COLORS: Record<FilingType, { bg: string; text: string }> = {
  PDC: { bg: '#FDF3E3', text: '#8B5E1A' },
  SCIA: { bg: '#E8EEE6', text: '#3D5C38' },
  CILA: { bg: '#E6E8F0', text: '#3A4A82' },
};

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

/* ── Tag Badge ──────────────────────────────────── */

function TagBadge({ tag }: { tag: string }) {
  return (
    <View className="mr-1 mt-1 rounded-full bg-parchment-200 px-2.5 py-0.5">
      <Text className="text-xs font-medium text-stone-600">{TAG_LABELS[tag] ?? tag}</Text>
    </View>
  );
}

/* ── Permit Card ────────────────────────────────── */

function PermitCard({ permit, onPress }: { permit: Permit; onPress: () => void }) {
  const tags = parsePermitTags(permit.tags);
  const statusLabel = STATUS_LABELS[permit.status] ?? permit.status_raw;
  const dotColor = STATUS_DOT[permit.status] ?? '#9ca3af';
  const fc = FILING_COLORS[permit.filing_type as FilingType] ?? FILING_COLORS.PDC;

  const a11yLabel = [
    permit.filing_type,
    statusLabel,
    permit.is_new === 1 ? 'nuovo' : null,
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
        {permit.is_new === 1 && (
          <View className="ml-auto rounded-full bg-brick-600 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-white">NUOVO</Text>
          </View>
        )}
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

      {/* Footer: date + protocol */}
      <View className="mt-2 flex-row items-center">
        {(permit.date_issued || permit.source_updated_at) && (
          <View className="mr-3 flex-row items-center">
            <Ionicons name="calendar-outline" size={12} color="#70593f" />
            <Text className="ml-1 text-xs text-stone-600">
              {formatItDate(permit.date_issued ?? permit.source_updated_at)}
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
  onlyNew,
  toggleOnlyNew,
  sort,
  setSort,
}: {
  activeZones: Set<Quartiere>;
  toggleZone: (z: Quartiere) => void;
  activeStatuses: Set<string>;
  toggleStatus: (s: string) => void;
  onlyNew: boolean;
  toggleOnlyNew: () => void;
  sort: SortOption;
  setSort: (s: SortOption) => void;
}) {
  return (
    <View className="border-b border-stone-200 bg-white px-4 pb-3">
      {/* Only new */}
      <Pressable
        onPress={toggleOnlyNew}
        accessibilityRole="button"
        accessibilityLabel="Solo nuovi"
        accessibilityState={{ selected: onlyNew }}
        className={`mb-3 flex-row items-center self-start rounded-full px-3.5 py-2 ${
          onlyNew ? 'bg-brick-600' : 'bg-parchment-100'
        }`}>
        <Ionicons name="sparkles" size={14} color={onlyNew ? 'white' : '#8B7355'} />
        <Text
          className={`ml-1.5 text-xs font-semibold ${onlyNew ? 'text-white' : 'text-stone-500'}`}>
          Solo nuovi
        </Text>
      </Pressable>

      {/* Sort */}
      <Text className="mb-1.5 text-xs font-semibold text-stone-600">Ordina per</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
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
      </ScrollView>

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
    </View>
  );
}

/* ── Main Feed Screen ───────────────────────────── */

export default function FeedScreen() {
  const router = useRouter();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [activeTypes, setActiveTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  const [activeZones, setActiveZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<SortOption>('request_newest');
  const [search, setSearch] = useState('');
  const offsetRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);

  const activeFilterCount =
    (activeZones.size < QUARTIERI.length ? 1 : 0) +
    (activeStatuses.size > 0 ? 1 : 0) +
    (onlyNew ? 1 : 0) +
    (sort !== 'request_newest' ? 1 : 0);

  const loadPermits = useCallback(
    async (reset = false) => {
      const db = await getDb();
      const prefs = await loadPreferences();
      const newOffset = reset ? 0 : offsetRef.current;

      const filters: FeedFilters = {
        zones: activeZones.size < QUARTIERI.length ? [...activeZones] : prefs.zones,
        filingTypes: [...activeTypes].filter((t) => prefs.filingTypes.includes(t)),
        tags: prefs.tags,
        searchQuery: search || undefined,
        statuses: activeStatuses.size > 0 ? [...activeStatuses] : undefined,
        onlyNew: onlyNew || undefined,
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
    [activeTypes, activeZones, activeStatuses, onlyNew, sort, search]
  );

  useEffect(() => {
    loadPermits(true);
  }, [loadPermits]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPermits(true);
    setRefreshing(false);
  }, [loadPermits]);

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

  const resetFilters = () => {
    setActiveTypes(new Set(FILING_TYPE_ORDER));
    setActiveZones(new Set(QUARTIERI));
    setActiveStatuses(new Set());
    setOnlyNew(false);
    setSort('request_newest');
    setSearch('');
  };

  return (
    <View className="flex-1 bg-parchment-100">
      {/* Search bar + filter button */}
      <View className="flex-row items-center bg-white px-4 pb-2 pt-2">
        <TextInput
          className="flex-1 rounded-lg bg-parchment-100 px-4 py-2.5 text-base text-ink-800"
          placeholder="Cerca indirizzo o procedimento..."
          placeholderTextColor="#a89888"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          accessibilityLabel="Cerca indirizzo o procedimento"
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

      {/* Expandable filter panel */}
      {filtersOpen && (
        <FilterPanel
          activeZones={activeZones}
          toggleZone={toggleZone}
          activeStatuses={activeStatuses}
          toggleStatus={toggleStatus}
          onlyNew={onlyNew}
          toggleOnlyNew={() => setOnlyNew((v) => !v)}
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
        </View>
      )}

      <FlatList
        data={permits}
        keyExtractor={(item) => item.source_id}
        renderItem={({ item }) => (
          <PermitCard permit={item} onPress={() => router.push(`/permit/${item.id}`)} />
        )}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9B2335" />
        }
        onEndReached={() => hasMore && loadPermits(false)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? (
            <View className="items-center pt-20">
              <Text className="text-base text-stone-600">Caricamento...</Text>
            </View>
          ) : !hasData ? (
            <EmptyDataState />
          ) : (
            <EmptyFilterState onReset={resetFilters} />
          )
        }
      />
    </View>
  );
}
