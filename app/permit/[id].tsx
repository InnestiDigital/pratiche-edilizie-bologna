import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Share, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../../lib/db';
import { getPermitById, getRelatedPermits, parsePermitTags, type Permit } from '../../lib/queries';
import { isFavorite, toggleFavorite } from '../../lib/favorites';
import { formatProtocol } from '../../lib/format-protocol';
import { buildMapsUrl } from '../../lib/maps-url';
import { buildPermitTimeline } from '../../lib/permit-timeline';
import { pendingDurationLabel } from '../../lib/pending-duration';
import { buildShareMessage } from '../../lib/share-message';
import { DetailSkeleton } from '../../components/DetailSkeleton';
import {
  FILING_TYPE_LABELS,
  FILING_TYPE_FULL_NAMES,
  FILING_TYPE_DESCRIPTIONS,
  FILING_COLORS,
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  TAG_LABELS,
  type FilingType,
} from '../../lib/constants';

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

function InfoRow({
  icon,
  label,
  value,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View className={`flex-row py-3 ${!isLast ? 'border-b border-parchment-200' : ''}`}>
      <View className="mr-3 mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-parchment-100">
        <Ionicons name={icon} size={15} color="#8B7355" />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-semibold text-stone-600">{label}</Text>
        <Text className="mt-0.5 text-[15px] text-ink-800" selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Timeline({ events }: { events: ReturnType<typeof buildPermitTimeline> }) {
  return (
    <View>
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        return (
          <View key={e.key} className="flex-row">
            {/* Rail: dot + connecting line */}
            <View className="mr-3 items-center">
              <View
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${e.color}1A` }}>
                <Ionicons
                  name={e.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={e.color}
                />
              </View>
              {!isLast && <View className="mt-1 w-0.5 flex-1 bg-parchment-200" />}
            </View>
            {/* Event */}
            <View className={`flex-1 ${isLast ? 'pb-0' : 'pb-5'}`}>
              <Text className="text-xs font-semibold text-stone-600">{e.label}</Text>
              <Text className="mt-0.5 text-[15px] font-medium text-ink-800" selectable>
                {e.date}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** One compact button in the secondary action row (Salva · Mappe · Condividi):
 *  stacked icon + label, equal-width via flex-1. `active` tints it brick (used for
 *  the saved state); otherwise a neutral outline that reads as secondary to the
 *  full-width primary CTA above it. */
function SecondaryAction({
  icon,
  label,
  onPress,
  active,
  role = 'button',
  accessibilityLabel,
  accessibilityHint,
  selected,
  isFirst,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  role?: 'button' | 'link';
  accessibilityLabel: string;
  accessibilityHint?: string;
  selected?: boolean;
  isFirst?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      className={`flex-1 items-center justify-center rounded-xl border py-3 ${
        isFirst ? '' : 'ml-2'
      } ${active ? 'border-brick-600 bg-brick-50' : 'border-stone-300 bg-white'}`}>
      <Ionicons name={icon} size={20} color={active ? '#9B2335' : '#5c5248'} />
      <Text
        className={`mt-1 text-xs font-semibold ${active ? 'text-brick-600' : 'text-ink-600'}`}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One tappable row in the "Nella stessa zona" card — filing badge, address, status. */
function RelatedRow({
  permit,
  isLast,
  onPress,
}: {
  permit: Permit;
  isLast: boolean;
  onPress: () => void;
}) {
  const filingType = permit.filing_type as FilingType;
  const fc = FILING_COLORS[filingType] ?? FILING_COLORS.PDC;
  const statusLabel = STATUS_LABELS[permit.status] ?? permit.status_raw;
  const dotColor = STATUS_DOT[permit.status] ?? '#9ca3af';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${permit.filing_type}, ${permit.address ?? 'Indirizzo non disponibile'}, ${statusLabel}`}
      accessibilityHint="Apri i dettagli di questa pratica"
      className={`flex-row items-center py-3 ${!isLast ? 'border-b border-parchment-200' : ''}`}>
      <View className="mr-3 rounded-md px-2 py-1" style={{ backgroundColor: fc.bg }}>
        <Text className="text-[11px] font-bold" style={{ color: fc.text }}>
          {permit.filing_type}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink-800" numberOfLines={1}>
          {permit.address ?? 'Indirizzo non disponibile'}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          <View className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
          <Text className="text-xs text-stone-500">{statusLabel}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#a89888" />
    </Pressable>
  );
}

export default function PermitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permit, setPermit] = useState<Permit | null>(null);
  const [related, setRelated] = useState<Permit[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    // A new [id] mount reuses this component, so clear the previous permit's
    // related list until the new one resolves (avoids a flash of stale rows).
    setRelated([]);
    getDb().then((db) =>
      getPermitById(db, Number(id)).then((p) => {
        setPermit(p);
        if (p) {
          isFavorite(db, p.source_id).then(setSaved);
          getRelatedPermits(db, p.zone, p.id).then(setRelated);
        }
      })
    );
  }, [id]);

  const handleToggleSave = async () => {
    if (!permit) return;
    const db = await getDb();
    setSaved(await toggleFavorite(db, permit.source_id, new Date().toISOString()));
  };

  if (!permit) {
    return <DetailSkeleton />;
  }

  const tags = parsePermitTags(permit.tags);
  const filingType = permit.filing_type as FilingType;
  const filingLabel = FILING_TYPE_LABELS[filingType] ?? permit.filing_type;
  const statusLabel = STATUS_LABELS[permit.status] ?? permit.status_raw;
  const dotColor = STATUS_DOT[permit.status] ?? '#9ca3af';
  const fc = FILING_COLORS[filingType] ?? FILING_COLORS.PDC;

  const protocol = formatProtocol(permit.source_id);
  const mapsUrl = buildMapsUrl(permit.address, Platform.OS);
  const timeline = buildPermitTimeline(permit);

  // Plain-Italian meaning of the current status (jargon like "Decaduta" tells the
  // citizen nothing). Only shown for a recognized status; 'altro'/unknown → none.
  const statusDescription = STATUS_DESCRIPTIONS[permit.status];

  // For a still-pending permit, the one fact a resident tracking it wants: how long
  // it has been waiting since the request was filed. Only for `in_attesa`; the pure
  // builder returns null when the request date is missing.
  const pendingLabel =
    permit.status === 'in_attesa'
      ? pendingDurationLabel(permit.source_updated_at, new Date())
      : null;

  // Plain-Italian explainer for the filing procedure. Only render it for a known
  // type — an unrecognized filing_type gets no card rather than a wrong caption.
  const filingFullName = FILING_TYPE_FULL_NAMES[filingType];
  const filingDescription = FILING_TYPE_DESCRIPTIONS[filingType];

  const handleShare = async () => {
    const message = buildShareMessage({
      filingLabel,
      address: permit.address,
      zone: permit.zone,
      procedimento: permit.procedimento,
      statusLabel,
      protocol,
      requestDate: permit.source_updated_at,
      sourceLink: permit.source_link,
    });
    await Share.share({ message });
  };

  return (
    <ScrollView className="flex-1 bg-parchment-100">
      <View className="p-4">
        {/* Header card */}
        <View
          className="rounded-2xl bg-white p-5"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}>
          {/* Badges */}
          <View className="mb-3 flex-row flex-wrap items-center">
            <View className="rounded-lg px-3 py-1" style={{ backgroundColor: fc.bg }}>
              <Text className="text-sm font-bold" style={{ color: fc.text }}>
                {filingLabel}
              </Text>
            </View>
            {permit.is_new === 1 && (
              <View className="ml-2 rounded-full bg-brick-600 px-2.5 py-0.5">
                <Text className="text-[10px] font-bold text-white">NUOVO</Text>
              </View>
            )}
          </View>

          {/* Address */}
          <Text className="text-xl font-bold leading-7 text-ink-800" selectable>
            {permit.address ?? 'Indirizzo non disponibile'}
          </Text>

          {/* Zone */}
          {permit.zone && (
            <View className="mt-1.5 flex-row items-center">
              <Ionicons name="location-outline" size={14} color="#8B7355" />
              <Text className="ml-1 text-base text-stone-500">{permit.zone}</Text>
            </View>
          )}

          {/* Protocol */}
          <Text className="mt-1 text-sm text-stone-600" selectable>
            Prot. {protocol}
          </Text>

          {/* Status */}
          <View className="mt-3 flex-row items-center self-start rounded-full bg-parchment-100 px-3 py-1.5">
            <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
            <Text className="text-sm font-semibold text-ink-700">{statusLabel}</Text>
          </View>

          {/* How long a pending permit has been waiting since the request — the
              concrete, personal counterpart to the generic status description. */}
          {pendingLabel && (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="hourglass-outline" size={14} color="#3b82f6" />
              <Text className="ml-1.5 text-[13px] font-semibold" style={{ color: '#3b82f6' }}>
                {pendingLabel}
              </Text>
            </View>
          )}

          {/* Plain-Italian meaning of the status — turns the jargon label into
              something a resident can actually act on. */}
          {statusDescription && (
            <Text className="mt-2 text-[13px] leading-5 text-stone-600">{statusDescription}</Text>
          )}
        </View>

        {/* Che cos'è — plain-Italian explainer of the filing procedure */}
        {filingDescription && (
          <View
            className="mt-3 rounded-2xl bg-white p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View className="flex-row items-start">
              <View
                className="mr-3 h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: fc.bg }}>
                <Ionicons name="information-circle-outline" size={18} color={fc.text} />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold" style={{ color: fc.text }}>
                  {permit.filing_type}
                </Text>
                <Text className="text-[15px] font-bold leading-5 text-ink-800">
                  {filingFullName}
                </Text>
                <Text className="mt-1.5 text-[13px] leading-5 text-stone-600">
                  {filingDescription}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Procedimento */}
        {permit.procedimento && (
          <View
            className="mt-3 rounded-2xl bg-white p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Text className="mb-1 text-xs font-semibold text-stone-600">Procedimento</Text>
            <Text className="text-[15px] leading-6 text-ink-700" selectable>
              {permit.procedimento}
            </Text>
          </View>
        )}

        {/* Cronologia — key dates as a chronological timeline */}
        {timeline.length > 0 && (
          <View
            className="mt-3 rounded-2xl bg-white p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Text className="mb-3 text-xs font-semibold text-stone-600">Cronologia</Text>
            <Timeline events={timeline} />
          </View>
        )}

        {/* Dettagli — non-temporal facts */}
        <View
          className="mt-3 rounded-2xl bg-white px-5"
          style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          {permit.status_raw && (
            <InfoRow
              icon="flag-outline"
              label="Esito pratica (originale)"
              value={permit.status_raw}
            />
          )}
          <InfoRow
            icon="layers-outline"
            label="Dataset"
            value={permit.dataset.toUpperCase()}
            isLast
          />
        </View>

        {/* Tags */}
        {tags.length > 0 && (
          <View
            className="mt-3 rounded-2xl bg-white p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Text className="mb-2 text-xs font-semibold text-stone-600">Etichette</Text>
            <View className="flex-row flex-wrap">
              {tags.map((t) => (
                <View key={t} className="mb-2 mr-2 rounded-full bg-parchment-200 px-3.5 py-1.5">
                  <Text className="text-sm font-medium text-stone-600">{TAG_LABELS[t] ?? t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Nella stessa zona — other permits in the same quartiere */}
        {related.length > 0 && (
          <View
            className="mt-3 rounded-2xl bg-white px-5 py-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View className="mb-1 flex-row items-center">
              <Ionicons name="location-outline" size={14} color="#8B7355" />
              <Text className="ml-1.5 text-xs font-semibold text-stone-600">Nella stessa zona</Text>
              {permit.zone && (
                <Text className="ml-1 text-xs text-stone-500" numberOfLines={1}>
                  · {permit.zone}
                </Text>
              )}
            </View>
            {related.map((r, i) => (
              <RelatedRow
                key={r.id}
                permit={r}
                isLast={i === related.length - 1}
                onPress={() => router.push(`/permit/${r.id}`)}
              />
            ))}
          </View>
        )}

        {/* Actions — one full-width primary CTA (the official record) over a
            compact equal-width secondary row (Salva · Mappe · Condividi), so the
            three secondary actions read as secondary and cost one row, not three. */}
        <View className="mt-4">
          {permit.source_link && (
            <Pressable
              onPress={() => Linking.openURL(permit.source_link!)}
              accessibilityRole="link"
              accessibilityLabel="Vedi su Open Data Bologna"
              accessibilityHint="Apre la scheda della pratica nel browser"
              className="flex-row items-center justify-center rounded-xl bg-brick-600 py-4"
              style={{
                shadowColor: '#9B2335',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 4,
              }}>
              <Ionicons name="open-outline" size={18} color="white" />
              <Text className="ml-2 text-base font-bold text-white">Vedi su Open Data Bologna</Text>
            </Pressable>
          )}

          <View className={`flex-row ${permit.source_link ? 'mt-2' : ''}`}>
            <SecondaryAction
              isFirst
              icon={saved ? 'bookmark' : 'bookmark-outline'}
              label={saved ? 'Salvata' : 'Salva'}
              onPress={handleToggleSave}
              active={saved}
              accessibilityLabel={saved ? 'Rimuovi dai salvati' : 'Salva pratica'}
              selected={saved}
            />
            {mapsUrl && (
              <SecondaryAction
                icon="navigate-outline"
                label="Mappe"
                onPress={() => Linking.openURL(mapsUrl)}
                role="link"
                accessibilityLabel="Apri in Mappe"
                accessibilityHint="Apre la posizione della pratica nell'app mappe"
              />
            )}
            <SecondaryAction
              icon="share-outline"
              label="Condividi"
              onPress={handleShare}
              accessibilityLabel="Condividi"
            />
          </View>
        </View>

        <View className="h-10" />
      </View>
    </ScrollView>
  );
}
