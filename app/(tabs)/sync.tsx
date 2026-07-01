import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { syncRecent, syncFull, getLastSyncTime, type SyncResult } from '../../lib/sync';
import { getDb } from '../../lib/db';
import { getStats } from '../../lib/queries';
import Ionicons from '@expo/vector-icons/Ionicons';

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
    newCount: number;
  } | null>(null);

  useEffect(() => {
    loadInfo();
  }, []);

  async function loadInfo() {
    setLastSync(await getLastSyncTime());
    const db = await getDb();
    const s = await getStats(db);
    setStats(s);
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

        {lastSync && (
          <Text className="mt-3 text-center text-xs text-stone-400">
            Ultimo aggiornamento: {formatDate(lastSync)}
          </Text>
        )}

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

            <View
              className="mb-4 flex-row justify-between rounded-xl bg-white p-4"
              style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              {[
                { value: stats.total, label: 'Totale', color: '#9B2335' },
                { value: stats.newCount, label: 'Nuovi', color: '#ef4444' },
                { value: stats.byDataset.pdc ?? 0, label: 'PdC', color: '#8B5E1A' },
                { value: stats.byDataset.scia ?? 0, label: 'SCIA', color: '#3D5C38' },
                { value: stats.byDataset.cila ?? 0, label: 'CILA', color: '#3A4A82' },
              ].map((item) => (
                <View key={item.label} className="items-center">
                  <Text className="text-xl font-bold" style={{ color: item.color }}>
                    {item.value.toLocaleString('it-IT')}
                  </Text>
                  <Text className="text-xs text-stone-500">{item.label}</Text>
                </View>
              ))}
            </View>

            <Text className="mb-2 text-base font-bold text-ink-800">Per Quartiere</Text>
            <View
              className="overflow-hidden rounded-xl bg-white"
              style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              {(() => {
                const maxZone = Math.max(1, ...Object.values(stats.byZone));
                return Object.entries(stats.byZone).map(([zone, count], i, arr) => (
                  <View
                    key={zone}
                    className={`px-4 py-3 ${
                      i < arr.length - 1 ? 'border-b border-parchment-200' : ''
                    }`}>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm text-ink-600">{zone}</Text>
                      <Text className="text-sm font-bold text-ink-800">
                        {count.toLocaleString('it-IT')}
                      </Text>
                    </View>
                    <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-parchment-200">
                      <View
                        className="h-full rounded-full bg-brick-500"
                        style={{ width: `${Math.max(6, (count / maxZone) * 100)}%` }}
                      />
                    </View>
                  </View>
                ));
              })()}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
