import { useState, useEffect, type ComponentProps } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { syncRecent, syncFull, getLastSyncTime, type SyncResult } from '../../lib/sync';
import { backfillEdiliziaCoords } from '../../lib/civici-sync';
import { loadPreferences } from '../../lib/preferences';
import {
  SOURCES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type SourceKey,
} from '../../lib/sources';
import { getDb } from '../../lib/db';
import { CITY } from '../../lib/city';
import { getStats, getReleasedDatePairs } from '../../lib/queries';
import { buildStatusBreakdown } from '../../lib/status-breakdown';
import { buildMonthlyActivity, monthlyActivityRangeLabel } from '../../lib/monthly-activity';
import {
  buildProcessingStats,
  processingRangeLabel,
  type ProcessingStats,
} from '../../lib/processing-stats';
import { italianDaySpan } from '../../lib/duration-span';
import { syncFreshness, type SyncFreshnessTier } from '../../lib/sync-freshness';
import { recordNoun } from '../../lib/record-noun';
import Ionicons from '@expo/vector-icons/Ionicons';

/* Sync-freshness tone: the pure lib decides the tier, the screen owns how each
   tier reads. Fresh = reassuring green check ("your data is current"), recent =
   quiet neutral, stale = amber alarm (paired with the resync nudge below). */
type IoniconName = ComponentProps<typeof Ionicons>['name'];
const FRESHNESS_TONE: Record<
  SyncFreshnessTier,
  { icon: IoniconName | null; iconColor: string; textClass: string }
> = {
  fresh: { icon: 'checkmark-circle', iconColor: '#15803d', textClass: 'text-green-700' },
  recent: { icon: null, iconColor: '', textClass: 'text-stone-700' },
  stale: { icon: 'alert-circle', iconColor: '#b45309', textClass: 'text-amber-700' },
};

/* Composition-bar segments, derived from the SOURCES registry so a new source
   can never be forgotten (its rows would otherwise be invisible in stats.byDataset).
   Edilizia keeps its three compact acronym labels + per-filing bar colors (the
   visual language of the filing badges); every other source takes its registry
   label + category accent. */
const EDILIZIA_BAR: Partial<Record<SourceKey, { label: string; color: string }>> = {
  pdc: { label: 'PdC', color: '#8B5E1A' },
  scia: { label: 'SCIA', color: '#3D5C38' },
  cila: { label: 'CILA', color: '#3A4A82' },
};
const DATASET_META: { key: SourceKey; label: string; color: string }[] = (
  Object.keys(SOURCES) as SourceKey[]
).map((key) => {
  const ed = EDILIZIA_BAR[key];
  return ed
    ? { key, ...ed }
    : { key, label: SOURCES[key].label, color: CATEGORY_COLORS[SOURCES[key].category].text };
});

export default function SyncScreen() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    byDataset: Record<string, number>;
    byZone: Record<string, number>;
    byStatus: Record<string, number>;
    byMonth: Record<string, number>;
    newCount: number;
  } | null>(null);
  // Typical request→release time across released permits (median + range), or null
  // when too few concluded permits exist to state a "typical" time honestly.
  const [processing, setProcessing] = useState<ProcessingStats | null>(null);

  useEffect(() => {
    loadInfo();
  }, []);

  async function loadInfo() {
    setLastSync(await getLastSyncTime());
    const db = await getDb();
    const s = await getStats(db);
    setStats(s);
    setProcessing(buildProcessingStats(await getReleasedDatePairs(db)));
  }

  async function handleSync(full: boolean) {
    setSyncing(true);
    setProgress([]);
    setResults([]);
    setSyncDone(false);
    // Restrict the download to the user's followed categories — a user who
    // deselected commercio/segnalazioni must not pay for their ~235k opted-out
    // rows. Mirrors background-sync.ts, which passes the same interests.
    const { interests } = await loadPreferences();
    const fn = full ? syncFull : syncRecent;
    const syncResults = await fn((msg) => {
      setProgress((prev) => [...prev, msg]);
    }, interests);
    setResults(syncResults);
    // P4: once edilizia rows have landed, geocode the coordinate-less ones from
    // the civici gazetteer so their detail gains the "Nei dintorni" proximity
    // card (edilizia is the one category with no source coordinate). Only when
    // edilizia is followed; the pass is a no-op (zero network) once every
    // edilizia row already carries a coordinate. A failure is surfaced, not
    // swallowed, and never aborts the completed sync above.
    if (interests.includes('edilizia')) {
      try {
        const db = await getDb();
        await backfillEdiliziaCoords(db, undefined, (msg) => {
          setProgress((prev) => [...prev, msg]);
        });
      } catch (e) {
        setProgress((prev) => [
          ...prev,
          `Geocodifica edilizia non riuscita — ${e instanceof Error ? e.message : String(e)}`,
        ]);
      }
    }
    setSyncing(false);
    setSyncDone(true);
    await loadInfo();
  }

  const handleGoToFeed = () => {
    router.navigate('/(tabs)');
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isEmpty = !stats || stats.total === 0;
  const totalInserted = results.reduce((sum, r) => sum + (r.inserted ?? 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated ?? 0), 0);
  const hasErrors = results.some((r) => r.error);

  return (
    <ScrollView className="flex-1 bg-parchment-100">
      <View className="p-4">
        {/* Welcome banner */}
        {isEmpty && !syncing && !syncDone && (
          <View
            className="mb-5 items-center rounded-2xl bg-white p-6"
            style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-brick-50">
              <Ionicons name="cloud-download-outline" size={28} color="#9B2335" />
            </View>
            <Text className="text-lg font-bold text-ink-800">Benvenuto!</Text>
            <Text className="mt-1 text-center text-sm leading-5 text-stone-500">
              Scarica i dati aperti del {CITY.provider}.{'\n'}
              La prima sincronizzazione richiede circa 1 minuto.
            </Text>
          </View>
        )}

        {/* Success banner */}
        {syncDone && !hasErrors && (
          <View
            className="mb-5 items-center rounded-2xl bg-white p-6"
            style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
            </View>
            <Text className="text-lg font-bold text-ink-800">Sincronizzazione completata</Text>
            <Text className="mt-1 text-sm text-stone-500">
              {totalInserted} nuove voci, {totalUpdated} aggiornate
            </Text>
            <Pressable
              onPress={handleGoToFeed}
              accessibilityRole="button"
              accessibilityLabel="Esplora le voci"
              className="mt-4 flex-row items-center rounded-xl bg-brick-600 px-5 py-3">
              <Ionicons name="compass-outline" size={16} color="white" />
              <Text className="ml-2 font-bold text-white">Esplora le voci</Text>
            </Pressable>
          </View>
        )}

        {/* Quick sync button */}
        <Pressable
          onPress={() => handleSync(false)}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel={
            syncing ? 'Sincronizzazione in corso' : 'Aggiornamento rapido, ultimi 2 anni'
          }
          accessibilityState={{ disabled: syncing, busy: syncing }}
          className={`flex-row items-center justify-center rounded-xl py-4 ${
            syncing ? 'bg-stone-400' : 'bg-brick-600'
          }`}>
          {syncing ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text className="ml-2 text-base font-bold text-white">Sincronizzazione...</Text>
            </>
          ) : (
            <>
              <Ionicons name="flash-outline" size={20} color="white" />
              <Text className="ml-2 text-base font-bold text-white">
                Aggiornamento Rapido (ultimi 2 anni)
              </Text>
            </>
          )}
        </Pressable>

        {/* Full sync */}
        {!syncing && (
          <Pressable
            onPress={() => handleSync(true)}
            accessibilityRole="button"
            accessibilityLabel="Scarica storico completo"
            className="mt-2 flex-row items-center justify-center rounded-xl border border-stone-300 bg-white py-3">
            <Ionicons name="download-outline" size={18} color="#8B7355" />
            <Text className="ml-2 text-sm font-semibold text-stone-500">
              Scarica storico completo
            </Text>
          </Pressable>
        )}

        {lastSync &&
          (() => {
            // Freshness cue: turn the raw timestamp into a human "Aggiornato N …
            // fa" and tone it by tier — a just-synced snapshot gets a reassuring
            // green check, a mid-range one stays neutral, and only genuinely stale
            // data raises the amber alarm + resync nudge (so it never over-alarms).
            // `new Date()` (the real clock) is read only here; the label/tier
            // mapping is the pure, tested `syncFreshness`.
            const fresh = syncFreshness(lastSync, new Date());
            const tone = FRESHNESS_TONE[fresh?.tier ?? 'recent'];
            return (
              <View className="mt-3 items-center">
                <View className="flex-row items-center">
                  {tone.icon && (
                    <Ionicons
                      name={tone.icon}
                      size={13}
                      color={tone.iconColor}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text className={`text-xs font-semibold ${tone.textClass}`}>
                    {fresh ? `Aggiornato ${fresh.label}` : 'Ultimo aggiornamento'}
                  </Text>
                </View>
                <Text className="mt-0.5 text-[11px] text-stone-400">{formatDate(lastSync)}</Text>
                {fresh?.tier === 'stale' && (
                  <Text className="mt-0.5 text-[11px] text-amber-700">
                    Tocca Aggiornamento Rapido per aggiornare i dati.
                  </Text>
                )}
              </View>
            );
          })()}

        {/* Progress */}
        {progress.length > 0 && (
          <View
            className="mt-4 rounded-2xl bg-white p-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            {progress.map((msg, i) => (
              <View key={i} className="mb-2 flex-row items-start">
                {i < progress.length - 1 || !syncing ? (
                  <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                ) : (
                  <ActivityIndicator size="small" color="#9B2335" />
                )}
                <Text className="ml-2 flex-1 text-sm text-ink-600">{msg}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Results */}
        {results.length > 0 && !syncing && (
          <View className="mt-4">
            {results.map((r) => (
              <View
                key={r.dataset}
                className="mb-2 flex-row items-center rounded-xl bg-white p-4"
                style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}>
                <View
                  className={`h-9 w-9 items-center justify-center rounded-full ${
                    r.error ? 'bg-red-50' : 'bg-green-50'
                  }`}>
                  <Ionicons
                    name={r.error ? 'close' : 'checkmark'}
                    size={18}
                    color={r.error ? '#ef4444' : '#22c55e'}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-ink-800">
                    {r.dataset.toUpperCase()}
                  </Text>
                  {r.error ? (
                    <Text className="text-xs text-red-500">{r.error}</Text>
                  ) : (
                    <Text className="text-xs text-stone-500">
                      {r.fetched} scaricati · {r.inserted} nuovi · {r.updated} aggiornati
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Stats */}
        {stats && stats.total > 0 && (
          <View className="mt-6">
            <Text className="mb-3 text-base font-bold text-ink-800">Database Locale</Text>

            {(() => {
              const segments = DATASET_META.map((m) => ({
                ...m,
                value: stats.byDataset[m.key] ?? 0,
              }));
              return (
                <View
                  className="mb-4 rounded-xl bg-white p-4"
                  style={{
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 1,
                  }}>
                  {/* Hero total + new-permits pill */}
                  <View className="flex-row items-end justify-between">
                    <View>
                      <Text className="text-3xl font-bold text-ink-800">
                        {stats.total.toLocaleString('it-IT')}
                      </Text>
                      <Text className="text-xs text-stone-600">voci totali</Text>
                    </View>
                    {stats.newCount > 0 && (
                      <View className="rounded-full bg-brick-50 px-3 py-1">
                        <Text className="text-xs font-bold text-brick-600">
                          {stats.newCount.toLocaleString('it-IT')}{' '}
                          {stats.newCount === 1 ? 'nuova' : 'nuove'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Proportional composition bar, one segment per source */}
                  <View className="mt-3 h-2.5 flex-row overflow-hidden rounded-full bg-parchment-200">
                    {segments.map((s) =>
                      s.value > 0 ? (
                        <View key={s.key} style={{ flex: s.value, backgroundColor: s.color }} />
                      ) : null
                    )}
                  </View>

                  {/* Legend — grouped by the 5-category taxonomy the feed chips +
                      settings use, so color = category stays 1:1. Edilizia's three
                      filing types are nested beneath its header (their per-filing
                      colors, esp. SCIA green, can't be misread as a top-level
                      category next to Commercio green). */}
                  <View className="mt-3">
                    {CATEGORIES.map((cat) => {
                      const catSources = (Object.keys(SOURCES) as SourceKey[]).filter(
                        (k) => SOURCES[k].category === cat
                      );
                      const catTotal = catSources.reduce(
                        (n, k) => n + (stats.byDataset[k] ?? 0),
                        0
                      );
                      if (catTotal === 0) return null;
                      const filings = catSources
                        .map((k) => {
                          const bar = EDILIZIA_BAR[k];
                          return bar ? { ...bar, value: stats.byDataset[k] ?? 0 } : null;
                        })
                        .filter(
                          (f): f is { label: string; color: string; value: number } =>
                            f !== null && f.value > 0
                        );
                      return (
                        <View key={cat} className="mt-1.5">
                          <View className="flex-row items-center">
                            <View
                              className="mr-1.5 h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: CATEGORY_COLORS[cat].text }}
                            />
                            <Text className="text-xs text-stone-600">
                              <Text className="font-bold text-ink-800">
                                {catTotal.toLocaleString('it-IT')}
                              </Text>{' '}
                              {CATEGORY_LABELS[cat]}
                            </Text>
                          </View>
                          {filings.length > 1 && (
                            <View className="ml-4 mt-0.5 flex-row flex-wrap">
                              {filings.map((f) => (
                                <View key={f.label} className="mr-3 mt-0.5 flex-row items-center">
                                  <View
                                    className="mr-1 h-2 w-2 rounded-full"
                                    style={{ backgroundColor: f.color }}
                                  />
                                  <Text className="text-[11px] text-stone-500">
                                    <Text className="font-semibold text-ink-700">
                                      {f.value.toLocaleString('it-IT')}
                                    </Text>{' '}
                                    {f.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {/* Voci per mese — trailing-months activity, bucketed by the
                request date, anchored to the most recent month in the data (a
                stale offline snapshot still shows its meaningful tail). Series +
                labels come from the pure, tested buildMonthlyActivity. */}
            {(() => {
              const activity = buildMonthlyActivity(stats.byMonth);
              if (activity.length === 0) return null;
              const range = monthlyActivityRangeLabel(activity);
              const BAR_MAX = 72;
              return (
                <View className="mb-6">
                  <View className="mb-2 flex-row items-baseline justify-between">
                    <Text className="text-base font-bold text-ink-800">Voci per mese</Text>
                    {range && <Text className="text-xs text-stone-500">{range}</Text>}
                  </View>
                  <View
                    className="rounded-xl bg-white p-4"
                    style={{
                      shadowColor: '#000',
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 1,
                    }}>
                    <View className="flex-row items-end">
                      {activity.map((m) => {
                        const barHeight = Math.max(8, Math.round((m.pct / 100) * BAR_MAX));
                        const barColor = m.isPeak ? 'bg-brick-600' : 'bg-brick-300';
                        return (
                          <View
                            key={m.monthKey}
                            className="flex-1 items-center"
                            accessibilityRole="text"
                            accessibilityLabel={`${m.label} ${m.year}: ${m.count} ${recordNoun(
                              m.count
                            )}`}>
                            {/* Count caption rides directly on top of its bar (not
                                pinned to the column top) so short bars don't leave
                                their number floating — every column reads as one
                                connected unit. justify-end keeps the shared baseline;
                                the +20 headroom fits the caption above a full-height
                                peak bar. Empty months keep a transparent caption so
                                columns stay the same height. */}
                            <View
                              style={{ height: BAR_MAX + 20 }}
                              className="w-full items-center justify-end">
                              <Text
                                className={`mb-1 text-[11px] font-bold ${
                                  m.count === 0 ? 'text-transparent' : 'text-ink-700'
                                }`}>
                                {m.count}
                              </Text>
                              {/* A zero month renders a flat full-width baseline tick,
                                  not a mini rounded bar — the previous 3px parchment nub
                                  shared the bars' shape and could read as a hair of
                                  activity. The wide, flat, un-rounded rule reads as an
                                  axis floor ("nothing rose here") instead. */}
                              {m.count === 0 ? (
                                <View className="h-[2px] w-full rounded-full bg-parchment-300" />
                              ) : (
                                <View
                                  className={`w-4 rounded-t-md ${barColor}`}
                                  style={{ height: barHeight }}
                                />
                              )}
                            </View>
                            <Text className="mt-1.5 text-[11px] text-stone-500">{m.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {/* Legend — the two brick tints read as two categories to a
                        first-time viewer; one line names the darker bar so the
                        highlight-the-max idiom is unambiguous (lighter bars are
                        then obviously "the rest"). */}
                    <View
                      className="mt-3 flex-row items-center border-t border-parchment-200 pt-2.5"
                      accessibilityRole="text"
                      accessibilityLabel="Il mese più attivo è evidenziato in scuro">
                      <View className="mr-1.5 h-2.5 w-2.5 rounded-full bg-brick-600" />
                      <Text className="text-[11px] text-stone-500">mese più attivo</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Tempi di rilascio — the typical time from request to release
                across released permits (median, robust to outliers) plus the
                observed range. Aggregate counterpart to the per-permit
                "Conclusa in …" caption; hidden below a small sample. */}
            {processing && (
              <View className="mb-6">
                <View className="mb-2 flex-row items-baseline justify-between">
                  <Text className="text-base font-bold text-ink-800">Tempi di rilascio</Text>
                  <Text className="text-xs text-stone-500">
                    su {processing.count.toLocaleString('it-IT')} {recordNoun(processing.count)}
                  </Text>
                </View>
                <View
                  className="flex-row items-center rounded-xl bg-white p-4"
                  style={{
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                  accessibilityRole="summary"
                  accessibilityLabel={`Tempo tipico dalla richiesta al rilascio: ${italianDaySpan(
                    processing.medianDays
                  )}. Intervallo osservato: ${processingRangeLabel(processing)}.`}>
                  <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-green-50">
                    <Ionicons name="time-outline" size={24} color="#22c55e" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-2xl font-bold text-ink-800">
                      {italianDaySpan(processing.medianDays)}
                    </Text>
                    <Text className="text-xs text-stone-600">
                      tempo tipico dalla richiesta al rilascio
                    </Text>
                    <Text className="mt-1 text-[11px] text-stone-500">
                      Intervallo: {processingRangeLabel(processing)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <Text className="mb-2 text-base font-bold text-ink-800">Per Quartiere</Text>
            <View
              className="overflow-hidden rounded-xl bg-white"
              style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              {(() => {
                const maxZone = Math.max(1, ...Object.values(stats.byZone));
                return Object.entries(stats.byZone).map(([zone, count], i, arr) => (
                  <Pressable
                    key={zone}
                    onPress={() =>
                      router.navigate({
                        pathname: '/(tabs)',
                        // Nonce so tapping the same zone twice re-applies the filter.
                        params: { zone, t: String(Date.now()) },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${zone}, ${count} ${recordNoun(count)}`}
                    accessibilityHint="Mostra le voci di questo quartiere nel feed"
                    className={`px-4 py-3 ${
                      i < arr.length - 1 ? 'border-b border-parchment-200' : ''
                    }`}>
                    <View className="flex-row items-center justify-between">
                      <Text className="flex-1 text-sm text-ink-600">{zone}</Text>
                      <Text className="text-sm font-bold text-ink-800">
                        {count.toLocaleString('it-IT')}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color="#a89888"
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                    <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-parchment-200">
                      <View
                        className="h-full rounded-full bg-brick-500"
                        style={{ width: `${Math.max(6, (count / maxZone) * 100)}%` }}
                      />
                    </View>
                  </Pressable>
                ));
              })()}
            </View>

            {/* Per Stato — status composition of the local DB, using the same
                status accent colors as the feed/detail dots so it reads as one
                language with the rest of the app. */}
            {(() => {
              const breakdown = buildStatusBreakdown(stats.byStatus, stats.total);
              if (breakdown.length === 0) return null;
              return (
                <View className="mt-6">
                  <Text className="mb-2 text-base font-bold text-ink-800">Per Stato</Text>
                  <View
                    className="overflow-hidden rounded-xl bg-white"
                    style={{
                      shadowColor: '#000',
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 1,
                    }}>
                    {breakdown.map((s, i) => (
                      <Pressable
                        key={s.status}
                        onPress={() =>
                          router.navigate({
                            pathname: '/(tabs)',
                            // Nonce so tapping the same status twice re-applies the filter.
                            params: { status: s.status, t: String(Date.now()) },
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${s.label}, ${s.count} ${recordNoun(s.count)}`}
                        accessibilityHint="Mostra le voci con questo stato nel feed"
                        className={`px-4 py-3 ${
                          i < breakdown.length - 1 ? 'border-b border-parchment-200' : ''
                        }`}>
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 flex-row items-center">
                            <View
                              className="mr-2 h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            <Text className="flex-1 text-sm text-ink-600" numberOfLines={1}>
                              {s.label}
                            </Text>
                          </View>
                          <Text className="ml-2 text-sm font-bold text-ink-800">
                            {s.count.toLocaleString('it-IT')}
                          </Text>
                          <Ionicons
                            name="chevron-forward"
                            size={15}
                            color="#a89888"
                            style={{ marginLeft: 8 }}
                          />
                        </View>
                        <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-parchment-200">
                          <View
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(6, s.pct)}%`,
                              backgroundColor: s.color,
                            }}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })()}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
