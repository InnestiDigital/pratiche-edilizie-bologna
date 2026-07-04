import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { syncRecent, syncFull, getLastSyncTime, type SyncResult } from '../../lib/sync';
import { getDb } from '../../lib/db';
import { getStats, getReleasedDatePairs } from '../../lib/queries';
import { buildStatusBreakdown } from '../../lib/status-breakdown';
import { buildMonthlyActivity, monthlyActivityRangeLabel } from '../../lib/monthly-activity';
import {
  buildProcessingStats,
  processingRangeLabel,
  type ProcessingStats,
} from '../../lib/processing-stats';
import { italianDaySpan } from '../../lib/duration-span';
import { syncFreshness } from '../../lib/sync-freshness';
import Ionicons from '@expo/vector-icons/Ionicons';

/* Dataset accent colors — same palette used for the filing-type badges across
   the feed and detail screens, so the composition bar reads as one language. */
const DATASET_META: { key: string; label: string; color: string }[] = [
  { key: 'pdc', label: 'PdC', color: '#8B5E1A' },
  { key: 'scia', label: 'SCIA', color: '#3D5C38' },
  { key: 'cila', label: 'CILA', color: '#3A4A82' },
];

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
    const fn = full ? syncFull : syncRecent;
    const syncResults = await fn((msg) => {
      setProgress((prev) => [...prev, msg]);
    });
    setResults(syncResults);
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
              Scarica i dati delle pratiche edilizie di Bologna.{'\n'}
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
              {totalInserted} nuove pratiche, {totalUpdated} aggiornate
            </Text>
            <Pressable
              onPress={handleGoToFeed}
              accessibilityRole="button"
              accessibilityLabel="Vai alle pratiche"
              className="mt-4 flex-row items-center rounded-xl bg-brick-600 px-5 py-3">
              <Ionicons name="document-text-outline" size={16} color="white" />
              <Text className="ml-2 font-bold text-white">Vai alle Pratiche</Text>
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
            // fa" and, once the local snapshot is stale, flag it (amber + icon) to
            // nudge a resync. `new Date()` (the real clock) is read only here; the
            // label/staleness mapping is the pure, tested `syncFreshness`.
            const fresh = syncFreshness(lastSync, new Date());
            return (
              <View className="mt-3 items-center">
                <View className="flex-row items-center">
                  {fresh?.stale && (
                    <Ionicons
                      name="alert-circle"
                      size={13}
                      color="#b45309"
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text
                    className={`text-xs font-semibold ${
                      fresh?.stale ? 'text-amber-700' : 'text-stone-700'
                    }`}>
                    {fresh ? `Aggiornato ${fresh.label}` : 'Ultimo aggiornamento'}
                  </Text>
                </View>
                <Text className="mt-0.5 text-[11px] text-stone-400">{formatDate(lastSync)}</Text>
                {fresh?.stale && (
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
                      <Text className="text-xs text-stone-600">pratiche totali</Text>
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

                  {/* Proportional composition bar (PdC / SCIA / CILA) */}
                  <View className="mt-3 h-2.5 flex-row overflow-hidden rounded-full bg-parchment-200">
                    {segments.map((s) =>
                      s.value > 0 ? (
                        <View key={s.key} style={{ flex: s.value, backgroundColor: s.color }} />
                      ) : null
                    )}
                  </View>

                  {/* Legend */}
                  <View className="mt-3 flex-row flex-wrap">
                    {segments.map((s) => (
                      <View key={s.key} className="mr-4 mt-1 flex-row items-center">
                        <View
                          className="mr-1.5 h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <Text className="text-xs text-stone-600">
                          <Text className="font-bold text-ink-800">
                            {s.value.toLocaleString('it-IT')}
                          </Text>{' '}
                          {s.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Pratiche per mese — trailing-months activity, bucketed by the
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
                    <Text className="text-base font-bold text-ink-800">Pratiche per mese</Text>
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
                        const barHeight =
                          m.count === 0 ? 3 : Math.max(8, Math.round((m.pct / 100) * BAR_MAX));
                        const barColor =
                          m.count === 0
                            ? 'bg-parchment-300'
                            : m.isPeak
                              ? 'bg-brick-600'
                              : 'bg-brick-300';
                        return (
                          <View
                            key={m.monthKey}
                            className="flex-1 items-center"
                            accessibilityRole="text"
                            accessibilityLabel={`${m.label} ${m.year}: ${m.count} ${
                              m.count === 1 ? 'pratica' : 'pratiche'
                            }`}>
                            {/* Count caption above each bar; transparent (not
                                omitted) on empty months so every column keeps the
                                same height and the bars share one baseline. */}
                            <Text
                              className={`mb-1 text-[11px] font-bold ${
                                m.count === 0 ? 'text-transparent' : 'text-ink-700'
                              }`}>
                              {m.count}
                            </Text>
                            <View style={{ height: BAR_MAX }} className="w-full justify-end">
                              <View
                                className={`mx-auto w-4 rounded-t-md ${barColor}`}
                                style={{ height: barHeight }}
                              />
                            </View>
                            <Text className="mt-1.5 text-[11px] text-stone-500">{m.label}</Text>
                          </View>
                        );
                      })}
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
                    su {processing.count.toLocaleString('it-IT')}{' '}
                    {processing.count === 1 ? 'pratica' : 'pratiche'}
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
                    accessibilityLabel={`${zone}, ${count} ${count === 1 ? 'pratica' : 'pratiche'}`}
                    accessibilityHint="Mostra le pratiche di questo quartiere nel feed"
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
                      <View
                        key={s.status}
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
                      </View>
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
