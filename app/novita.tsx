import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../lib/db';
import { getActivityPermits, type Permit } from '../lib/queries';
import { getActivitySeenAt, markActivitySeen } from '../lib/preferences';
import { buildActivityFeed, type ActivityEntry } from '../lib/activity-feed';
import { permitCardBadge } from '../lib/permit-card-badge';
import { statusChangeLine } from '../lib/status-transition';
import { formatItDate } from '../lib/format-date';

/**
 * "Novità" — the activity destination. A chronological "what moved on the voci you
 * follow" list that turns the two persisted signals (a fresh arrival `is_new`, a
 * status transition `previous_status`/`status_changed_at`) from per-card pills into
 * a first-class place to go. Pushed from the feed's "Novità" entry; each row taps
 * through to the same detail as the feed. Reuses the shared pure cores
 * (`buildActivityFeed`, `statusChangeLine`, `permitCardBadge`) so a row here can't
 * drift from its feed-card twin.
 */
export default function NovitaScreen() {
  const [entries, setEntries] = useState<ActivityEntry<Permit>[] | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        const ackAt = await getActivitySeenAt();
        const rows = await getActivityPermits(db, ackAt);
        if (active) {
          setEntries(buildActivityFeed(rows));
          // Visiting Novità acknowledges the activity just shown (auto-clear-
          // on-visit): stamp the watermark to now so the feed's badge, which
          // recomputes against it on its next focus, clears. Only genuinely
          // newer activity (arrived/changed after this stamp) will re-badge.
          await markActivitySeen();
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  if (entries === null) {
    return (
      <View className="flex-1 items-center justify-center bg-parchment-100">
        <ActivityIndicator color="#9B2335" />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-parchment-100 px-10">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-parchment-200">
          <Ionicons name="notifications-outline" size={30} color="#9B2335" />
        </View>
        <Text className="mb-1.5 text-center text-lg font-bold text-ink-800">Nessuna novità</Text>
        <Text className="text-center text-sm leading-5 text-stone-500">
          Quando una voce che segui cambia stato o ne arriva una nuova, la trovi qui. Aggiorna i
          dati per cercare le ultime novità.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-parchment-100">
      <View className="bg-white px-4 pb-2.5 pt-3">
        <Text className="text-xs font-semibold text-stone-500" accessibilityRole="header">
          {entries.length} {entries.length === 1 ? 'aggiornamento' : 'aggiornamenti'} sulle voci che
          segui
        </Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.permit.source_id}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <ActivityRow entry={item} onPress={() => router.push(`/permit/${item.permit.id}`)} />
        )}
      />
    </View>
  );
}

function ActivityRow({ entry, onPress }: { entry: ActivityEntry<Permit>; onPress: () => void }) {
  const { permit, kind, at } = entry;
  const badge = permitCardBadge(permit);
  const headline = permit.title ?? permit.address ?? 'Voce senza titolo';
  const when = formatItDate(at);
  // Transition entries render the shared "cosa è cambiato" line; a `new` entry
  // never has a prior status, so this is null there and the brick NUOVO tag shows.
  const change =
    kind === 'transition'
      ? statusChangeLine(permit.previous_status, permit.status, permit.category, permit.status_raw)
      : null;

  const a11yLabel = [
    badge.label,
    kind === 'transition' && change
      ? `stato cambiato, ora ${change.current}, era ${change.previous}`
      : 'nuova voce',
    headline,
    permit.zone,
    when ? `il ${when}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Apri i dettagli"
      className="mx-4 mb-2.5 flex-row items-center rounded-xl bg-white p-4"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      }}>
      <View className="flex-1">
        <View className="mb-2 flex-row items-center">
          <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: badge.bg }}>
            <Text className="text-xs font-bold" style={{ color: badge.text }}>
              {badge.label}
            </Text>
          </View>
          {when && <Text className="ml-auto text-xs font-medium text-stone-400">{when}</Text>}
        </View>

        <Text className="text-sm font-semibold leading-5 text-ink-800" numberOfLines={2}>
          {headline}
        </Text>
        {permit.zone && (
          <Text className="mt-0.5 text-xs text-stone-500" numberOfLines={1}>
            {permit.zone}
          </Text>
        )}

        {/* The reason this voce is in the activity feed. A transition reuses the
            amber "cosa è cambiato" treatment (identical to the feed card); a new
            arrival gets the brick NUOVO tag — the same two-voice split as the feed. */}
        {change ? (
          <View className="mt-2 flex-row items-center self-start rounded-full bg-pdc-light px-2.5 py-0.5">
            <Ionicons name="swap-horizontal" size={12} color="#8B5E1A" />
            <Text className="ml-1 text-xs font-semibold" style={{ color: '#6B4510' }}>
              Ora {change.current} · era {change.previous}
            </Text>
          </View>
        ) : (
          <View className="mt-2 flex-row items-center self-start rounded-full bg-brick-50 px-2.5 py-0.5">
            <Ionicons name="sparkles" size={11} color="#9B2335" />
            <Text className="ml-1 text-xs font-semibold text-brick-600">Nuova voce</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#c4b8a8" style={{ marginLeft: 12 }} />
    </Pressable>
  );
}
