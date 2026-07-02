import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Share } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../../lib/db';
import { getPermitById, parsePermitTags, type Permit } from '../../lib/queries';
import { formatItDate } from '../../lib/format-date';
import { formatProtocol } from '../../lib/format-protocol';
import {
  FILING_TYPE_LABELS,
  STATUS_LABELS,
  TAG_LABELS,
  type FilingType,
} from '../../lib/constants';

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

export default function PermitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permit, setPermit] = useState<Permit | null>(null);

  useEffect(() => {
    if (!id) return;
    getDb().then((db) => getPermitById(db, Number(id)).then(setPermit));
  }, [id]);

  if (!permit) {
    return (
      <View className="flex-1 items-center justify-center bg-parchment-100">
        <Text className="text-stone-600">Caricamento...</Text>
      </View>
    );
  }

  const tags = parsePermitTags(permit.tags);
  const filingType = permit.filing_type as FilingType;
  const filingLabel = FILING_TYPE_LABELS[filingType] ?? permit.filing_type;
  const statusLabel = STATUS_LABELS[permit.status] ?? permit.status_raw;
  const dotColor = STATUS_DOT[permit.status] ?? '#9ca3af';
  const fc = FILING_COLORS[filingType] ?? FILING_COLORS.PDC;

  const protocol = formatProtocol(permit.source_id);

  const handleShare = async () => {
    const text = [
      `${filingLabel} — ${permit.address ?? 'Indirizzo n.d.'}`,
      permit.procedimento ? `Procedimento: ${permit.procedimento}` : null,
      `Stato: ${statusLabel}`,
      `Protocollo: ${protocol}`,
      permit.source_link,
    ]
      .filter(Boolean)
      .join('\n');
    await Share.share({ message: text });
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
        </View>

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

        {/* Details */}
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
          {permit.date_issued && (
            <InfoRow
              icon="checkmark-circle-outline"
              label="Data chiusura"
              value={formatItDate(permit.date_issued) ?? permit.date_issued}
            />
          )}
          {permit.source_updated_at && (
            <InfoRow
              icon="time-outline"
              label="Data richiesta"
              value={formatItDate(permit.source_updated_at) ?? permit.source_updated_at}
            />
          )}
          {permit.first_seen_at && (
            <InfoRow
              icon="eye-outline"
              label="Rilevata dall'app"
              value={new Date(permit.first_seen_at).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
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

        {/* Actions */}
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

          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Condividi"
            className="mt-2 flex-row items-center justify-center rounded-xl border border-stone-300 bg-white py-3.5">
            <Ionicons name="share-outline" size={18} color="#5c5248" />
            <Text className="ml-2 text-base font-semibold text-ink-600">Condividi</Text>
          </Pressable>
        </View>

        <View className="h-10" />
      </View>
    </ScrollView>
  );
}
