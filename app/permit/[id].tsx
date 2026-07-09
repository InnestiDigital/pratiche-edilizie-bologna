import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HeaderBrand } from '../../components/HeaderBrand';
import {
  CATEGORY_DETAIL_TITLE,
  CATEGORY_REFERENCE_LABEL,
  CATEGORY_REFERENCE_LABEL_LONG,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  datasetLabelFor,
} from '../../lib/sources';
import { getDb } from '../../lib/db';
import {
  getPermitById,
  getRelatedPermits,
  getNearbyPermits,
  getReleasedDatePairs,
  markPermitSeen,
  parsePermitTags,
  type Permit,
} from '../../lib/queries';
import { formatNearbyDistance, type NearbyResult } from '../../lib/nearby-permits';
import { isFavorite, toggleFavorite } from '../../lib/favorites';
import { getNoteRecord, setNote, deleteNote } from '../../lib/notes';
import { normalizeNote, NOTE_MAX_LENGTH } from '../../lib/note-text';
import { formatItDate } from '../../lib/format-date';
import { formatProtocol } from '../../lib/format-protocol';
import { buildMapsUrl } from '../../lib/maps-url';
import { buildPermitTimeline } from '../../lib/permit-timeline';
import { pendingDurationLabel } from '../../lib/pending-duration';
import { processingDurationLabel } from '../../lib/processing-duration';
import { buildProcessingStats, type ProcessingStats } from '../../lib/processing-stats';
import { buildProcessingComparison } from '../../lib/processing-comparison';
import { buildShareMessage } from '../../lib/share-message';
import { extractStreetName } from '../../lib/street-name';
import { getCoords } from '../../lib/permit-extra';
import { loadPreferences, savePreferences } from '../../lib/preferences';
import { isSameLocation, type HomeLocation } from '../../lib/home-location';
import { STATUS_COLORS } from '../../lib/status-breakdown';
import { statusLabelFor } from '../../lib/status-label';
import { DetailSkeleton } from '../../components/DetailSkeleton';
import {
  FILING_TYPE_LABELS,
  FILING_TYPE_FULL_NAMES,
  FILING_TYPE_DESCRIPTIONS,
  FILING_COLORS,
  STATUS_DESCRIPTIONS,
  TAG_LABELS,
  type FilingType,
} from '../../lib/constants';

// Visual treatment for the "vs. local median" caption: a muted, secondary line
// under the green "Conclusa in …" duration. Green when faster, neutral stone when
// typical, amber (informative, not alarming) when slower — an over-median wait is
// context, not an error.
const PROCESSING_COMPARISON_STYLE: Record<
  'faster' | 'typical' | 'slower',
  { icon: 'trending-down-outline' | 'remove-circle-outline' | 'trending-up-outline'; color: string }
> = {
  faster: { icon: 'trending-down-outline', color: '#16a34a' },
  typical: { icon: 'remove-circle-outline', color: '#78716c' },
  slower: { icon: 'trending-up-outline', color: '#d97706' },
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
  const statusLabel = statusLabelFor(permit.status, permit.category, permit.status_raw);
  const dotColor = STATUS_COLORS[permit.status] ?? '#9ca3af';

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

/** One tappable row in the "Nei dintorni" card — filing badge, headline (title or
 *  address), and a rounded distance pill. Mirrors RelatedRow but swaps the status
 *  line for the "~120 m" proximity label, since these rows are drawn from any
 *  category and distance is the thing that makes them relevant here. */
function NearbyRow({
  permit,
  meters,
  isLast,
  onPress,
}: {
  permit: Permit;
  meters: number;
  isLast: boolean;
  onPress: () => void;
}) {
  const filingType = permit.filing_type as FilingType;
  const fc = FILING_COLORS[filingType] ?? FILING_COLORS.PDC;
  const headline = permit.title ?? permit.address ?? 'Indirizzo non disponibile';
  const distance = formatNearbyDistance(meters);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${permit.filing_type}, ${headline}, a ${distance}`}
      accessibilityHint="Apri i dettagli di questa pratica"
      className={`flex-row items-center py-3 ${!isLast ? 'border-b border-parchment-200' : ''}`}>
      <View className="mr-3 rounded-md px-2 py-1" style={{ backgroundColor: fc.bg }}>
        <Text className="text-[11px] font-bold" style={{ color: fc.text }}>
          {permit.filing_type}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink-800" numberOfLines={1}>
          {headline}
        </Text>
        {permit.address && permit.title && (
          <Text className="mt-0.5 text-xs text-stone-500" numberOfLines={1}>
            {permit.address}
          </Text>
        )}
      </View>
      <View className="ml-2 flex-row items-center rounded-full bg-parchment-100 px-2.5 py-1">
        <Ionicons name="walk-outline" size={13} color="#8B7355" />
        <Text className="ml-1 text-xs font-semibold text-stone-600">{distance}</Text>
      </View>
    </Pressable>
  );
}

/** The user's personal note on a permit — the one bit of content they author
 *  themselves. Loads/persists its own state keyed by the permit's stable
 *  `source_id` (survives re-syncs), so the parent detail screen doesn't have to
 *  thread note state. Three modes: an empty "add a note" prompt, a read view with
 *  a Modifica affordance, and an inline multiline editor. Saving an empty note
 *  deletes it (via `normalizeNote` → null). */
function NotesSection({ sourceId }: { sourceId: string }) {
  const [noteText, setNoteText] = useState<string | null>(null);
  const [noteUpdatedAt, setNoteUpdatedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setEditing(false);
    getDb().then((db) =>
      getNoteRecord(db, sourceId).then((rec) => {
        if (!active) return;
        setNoteText(rec?.note ?? null);
        setNoteUpdatedAt(rec?.updatedAt ?? null);
        setLoaded(true);
      })
    );
    return () => {
      active = false;
    };
  }, [sourceId]);

  const startEdit = () => {
    setDraft(noteText ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft('');
  };

  const save = async () => {
    const clean = normalizeNote(draft);
    const db = await getDb();
    if (clean) {
      const now = new Date().toISOString();
      await setNote(db, sourceId, clean, now);
      setNoteText(clean);
      setNoteUpdatedAt(now);
    } else {
      await deleteNote(db, sourceId);
      setNoteText(null);
      setNoteUpdatedAt(null);
    }
    setEditing(false);
    setDraft('');
  };

  // Hold render until the note has loaded so an existing note never flashes the
  // empty "add a note" prompt for a frame.
  if (!loaded) return null;

  const cardStyle = {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  } as const;

  // Editor
  if (editing) {
    return (
      <View
        className="mt-3 rounded-2xl border-l-[3px] border-brick-600 bg-white p-5"
        style={cardStyle}>
        <View className="mb-2 flex-row items-center">
          <Ionicons name="create-outline" size={15} color="#9B2335" />
          <Text className="ml-1.5 text-xs font-semibold text-stone-600">Le mie note</Text>
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={NOTE_MAX_LENGTH}
          autoFocus
          placeholder="Scrivi una nota personale su questa pratica…"
          placeholderTextColor="#a89888"
          accessibilityLabel="Testo della nota"
          className="rounded-xl border border-parchment-200 bg-parchment-50 p-3 text-[15px] leading-6 text-ink-800"
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
        <View className="mt-3 flex-row justify-end">
          <Pressable
            onPress={cancel}
            accessibilityRole="button"
            accessibilityLabel="Annulla modifica nota"
            className="mr-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5">
            <Text className="text-sm font-semibold text-ink-600">Annulla</Text>
          </Pressable>
          <Pressable
            onPress={save}
            accessibilityRole="button"
            accessibilityLabel="Salva nota"
            className="flex-row items-center rounded-xl bg-brick-600 px-4 py-2.5">
            <Ionicons name="checkmark" size={16} color="white" />
            <Text className="ml-1 text-sm font-bold text-white">Salva</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Empty prompt — the whole card taps into the editor. No red left-accent here:
  // that accent is the "this permit HAS a note" signal (feed + read view below), so
  // an empty prompt wears the neutral card like its "Altre voci"/explainer siblings.
  if (!noteText) {
    return (
      <Pressable
        onPress={startEdit}
        accessibilityRole="button"
        accessibilityLabel="Aggiungi una nota personale"
        accessibilityHint="Apre l'editor per scrivere una nota su questa pratica"
        className="mt-3 flex-row items-center rounded-2xl bg-white p-4"
        style={cardStyle}>
        <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-brick-50">
          <Ionicons name="add" size={20} color="#9B2335" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold text-stone-600">Le mie note</Text>
          <Text className="text-[15px] text-stone-500">Aggiungi una nota personale</Text>
        </View>
        <Ionicons name="create-outline" size={18} color="#a89888" />
      </Pressable>
    );
  }

  // Read view with a Modifica affordance.
  return (
    <View
      className="mt-3 rounded-2xl border-l-[3px] border-brick-600 bg-white p-5"
      style={cardStyle}>
      <View className="mb-2 flex-row items-center">
        <Ionicons name="create-outline" size={15} color="#9B2335" />
        <Text className="ml-1.5 text-xs font-semibold text-stone-600">Le mie note</Text>
        <View className="flex-1" />
        <Pressable
          onPress={startEdit}
          accessibilityRole="button"
          accessibilityLabel="Modifica nota"
          hitSlop={8}
          className="flex-row items-center">
          <Ionicons name="pencil" size={13} color="#9B2335" />
          <Text className="ml-1 text-xs font-semibold text-brick-600">Modifica</Text>
        </Pressable>
      </View>
      <Text className="text-[15px] leading-6 text-ink-800" selectable>
        {noteText}
      </Text>
      {noteUpdatedAt && formatItDate(noteUpdatedAt) && (
        <Text className="mt-2 text-[11px] text-stone-400">
          Aggiornata il {formatItDate(noteUpdatedAt)}
        </Text>
      )}
    </View>
  );
}

export default function PermitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permit, setPermit] = useState<Permit | null>(null);
  const [related, setRelated] = useState<Permit[]>([]);
  const [nearby, setNearby] = useState<NearbyResult<Permit>[]>([]);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const [saved, setSaved] = useState(false);
  // The current home anchor, so this detail can show whether THIS permit is the
  // set home (and offer to set/clear it when the row carries a coordinate).
  const [home, setHome] = useState<HomeLocation | null>(null);

  useEffect(() => {
    if (!id) return;
    // A new [id] mount reuses this component, so clear the previous permit's
    // related list until the new one resolves (avoids a flash of stale rows).
    setRelated([]);
    setNearby([]);
    setProcessingStats(null);
    getDb().then((db) =>
      getPermitById(db, Number(id)).then((p) => {
        setPermit(p);
        if (p) {
          isFavorite(db, p.source_id).then(setSaved);
          getRelatedPermits(db, p.zone, p.id).then(setRelated);
          // Other permits within ~500 m of this one (any category), nearest first —
          // resolves to [] for coordinate-less rows (all edilizia), so the card
          // only renders on the geo-dotted categories. See getNearbyPermits.
          getNearbyPermits(db, p).then(setNearby);
          // Local release-time median, so a concluded permit's "Conclusa in …"
          // caption can say whether it was fast or slow for Bologna. Cheap read
          // over the same released pairs the sync screen already aggregates.
          getReleasedDatePairs(db).then((pairs) => setProcessingStats(buildProcessingStats(pairs)));
          // Reading a permit marks it read (email-style): clear its NUOVO flag in
          // the DB so it no longer counts as unseen. The feed folds this into its
          // loaded cards on focus (see applySeenToList) without a reload. The
          // detail keeps its own NUOVO badge for this view — it WAS new when
          // opened — and the write is scoped to is_new=1, so an already-seen
          // permit is a no-op.
          if (p.is_new === 1) markPermitSeen(db, p.id);
        }
      })
    );
    // Load the home anchor so the "Imposta come casa" card reflects whether this
    // permit is already the set home.
    loadPreferences().then((prefs) => setHome(prefs.home));
  }, [id]);

  const handleToggleSave = async () => {
    if (!permit) return;
    const db = await getDb();
    setSaved(await toggleFavorite(db, permit.source_id, new Date().toISOString()));
  };

  // Anchor the feed's "Vicino a casa" filter on THIS permit's coordinate. Only
  // reachable when the row carries one (the card is gated on getCoords below), so
  // the coordinate here is real; the label is the permit's address/title.
  const handleSetHome = async () => {
    if (!permit) return;
    const coords = getCoords(permit.extra);
    if (!coords) return;
    const label = permit.address ?? permit.title ?? 'Posizione';
    const next: HomeLocation = { coords, label };
    await savePreferences({ home: next });
    setHome(next);
    Alert.alert(
      'Casa impostata',
      `Ora puoi filtrare il feed con «Vicino a casa» attorno a ${label}.`
    );
  };

  const handleClearHome = async () => {
    await savePreferences({ home: null });
    setHome(null);
  };

  if (!permit) {
    return <DetailSkeleton />;
  }

  const tags = parsePermitTags(permit.tags);
  const filingType = permit.filing_type as FilingType;
  const filingLabel = FILING_TYPE_LABELS[filingType] ?? permit.filing_type;
  const statusLabel = statusLabelFor(permit.status, permit.category, permit.status_raw);
  const dotColor = STATUS_COLORS[permit.status] ?? '#9ca3af';
  const fc = FILING_COLORS[filingType] ?? FILING_COLORS.PDC;

  const protocol = formatProtocol(permit.source_id);
  const mapsUrl = buildMapsUrl(permit.address, Platform.OS);
  const timeline = buildPermitTimeline(permit);

  // Street name (address minus the civic number) → a "see all permits on this
  // street" search, narrower than the zone-wide "Nella stessa zona" card below.
  // Only offered when a civic number was actually stripped (street differs from
  // the full address), so a bare street with no number does not show a redundant
  // "other permits in <the same address>" link.
  const streetName = extractStreetName(permit.address);
  const showStreetLink = streetName !== null && streetName !== permit.address?.trim();

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

  // For a concluded permit, the counterpart fact: how long the Comune took from
  // the request to the closing date. Only shown when a closing date exists and is
  // on/after the request (the pure builder returns null on a missing/backwards
  // date), so a still-pending permit — with no closing date — never shows it.
  const processingLabel =
    permit.status === 'in_attesa'
      ? null
      : processingDurationLabel(permit.source_updated_at, permit.date_issued);

  // Reference frame for that raw duration: was this permit fast or slow versus the
  // median release time across the local database? Only meaningful once we have a
  // "Conclusa in …" span to compare and a handful of local peers (the pure builder
  // returns null otherwise), so it never shows for a pending or lonely record.
  const processingComparison = processingLabel
    ? buildProcessingComparison(permit.source_updated_at, permit.date_issued, processingStats)
    : null;
  const comparisonStyle = processingComparison
    ? PROCESSING_COMPARISON_STYLE[processingComparison.tone]
    : null;

  // Plain-Italian explainer for the filing procedure. Only render it for a known
  // type — an unrecognized filing_type gets no card rather than a wrong caption.
  const filingFullName = FILING_TYPE_FULL_NAMES[filingType];
  const filingDescription = FILING_TYPE_DESCRIPTIONS[filingType];

  // Human dataset name (e.g. "Eventi culturali", "Permesso di Costruire") from the
  // source registry — replaces the raw uppercase dataset key both in the explainer
  // card title and in the "Dataset" fact row below.
  const datasetLabel = datasetLabelFor(permit.dataset);

  // Non-edilizia categories have no per-filing-type nuance, so they get a single
  // category-level "Che cos'è" card (edilizia keeps the richer filing-type one
  // above). This closes the asymmetry where a cantiere / commercio / evento /
  // segnalazione detail showed only a bare uppercase "Dataset" row and read as
  // less finished than an edilizia detail.
  const categoryColor = CATEGORY_COLORS[permit.category] ?? CATEGORY_COLORS.edilizia;
  const categoryDescription = filingDescription ? null : CATEGORY_DESCRIPTIONS[permit.category];

  const handleShare = async () => {
    const message = buildShareMessage({
      filingLabel,
      address: permit.address,
      zone: permit.zone,
      procedimento: permit.procedimento,
      statusLabel,
      referenceLabel: CATEGORY_REFERENCE_LABEL_LONG[permit.category] ?? 'Riferimento',
      protocol,
      requestDate: permit.source_updated_at,
      sourceLink: permit.source_link,
    });
    await Share.share({ message });
  };

  // Category-aware header title (rebrand: the app is no longer edilizia-only, so a
  // cantiere / evento / segnalazione must not read "Dettaglio Pratica"). Overrides
  // the neutral fallback set on the parent route once the row's category is known.
  const detailTitle = CATEGORY_DETAIL_TITLE[permit.category] ?? 'Dettaglio';

  // This permit's own coordinate (from `extra.lat/lon`), present on geo-dotted
  // rows and geocoded edilizia. When set it can anchor the "Vicino a casa" feed
  // filter; `isHome` tells whether it is already the current anchor.
  const homeCoords = getCoords(permit.extra);
  const isHome = isSameLocation(homeCoords, home?.coords ?? null);

  return (
    <ScrollView className="flex-1 bg-parchment-100">
      <Stack.Screen options={{ headerTitle: () => <HeaderBrand title={detailTitle} /> }} />
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

          {/* Reference id: a protocollo for edilizia/commercio, a plain record/
              ticket id (→ "Rif.") for cantieri/eventi/segnalazioni. Omitted
              entirely when the source_id yields no protocol string. */}
          {protocol !== '' && (
            <Text className="mt-1 text-sm text-stone-600" selectable>
              {CATEGORY_REFERENCE_LABEL[permit.category] ?? 'Rif.'} {protocol}
            </Text>
          )}

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

          {/* How long a concluded permit took from request to closing — the
              green, resolved counterpart to the blue pending countdown. */}
          {processingLabel && (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" />
              <Text className="ml-1.5 text-[13px] font-semibold" style={{ color: '#22c55e' }}>
                {processingLabel}
              </Text>
            </View>
          )}

          {/* How this permit's release time sits against the local median — the
              reference frame that turns the raw "Conclusa in …" span into a
              judgement (faster / typical / slower for Bologna). */}
          {processingComparison && comparisonStyle && (
            <View className="mt-1 flex-row items-center">
              <Ionicons name={comparisonStyle.icon} size={13} color={comparisonStyle.color} />
              <Text
                className="ml-1.5 text-[12px] font-medium"
                style={{ color: comparisonStyle.color }}>
                {processingComparison.label}
              </Text>
            </View>
          )}

          {/* Plain-Italian meaning of the status — turns the jargon label into
              something a resident can actually act on. */}
          {statusDescription && (
            <Text className="mt-2 text-[13px] leading-5 text-stone-600">{statusDescription}</Text>
          )}
        </View>

        {/* Le mie note — the resident's own note on this permit (the one bit of
            content they author), right under the header where their context is
            most relevant. */}
        <NotesSection sourceId={permit.source_id} />

        {/* Street shortcut — jump to the feed filtered to this street. Reuses the
            feed's address search (the `q` deep link) so it stays a single source
            of truth for what "on this street" means. */}
        {showStreetLink && (
          <Pressable
            onPress={() =>
              router.navigate({
                pathname: '/(tabs)',
                params: { q: streetName, t: String(Date.now()) },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Altre voci in ${streetName}`}
            accessibilityHint="Apre il feed con la ricerca su questa via"
            className="mt-3 flex-row items-center rounded-2xl bg-white p-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-parchment-100">
              <Ionicons name="trail-sign-outline" size={18} color="#8B7355" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-stone-600">Altre voci in</Text>
              <Text className="text-[15px] font-semibold text-ink-800" numberOfLines={1}>
                {streetName}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#a89888" />
          </Pressable>
        )}

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

        {/* Che cos'è (categoria) — plain-Italian explainer for a non-edilizia
            category, the sibling of the filing-type card above. Renders only when
            there is no filing-type description (i.e. every category except
            edilizia), so the two never both appear. */}
        {categoryDescription && (
          <View
            className="mt-3 rounded-2xl bg-white p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View className="flex-row items-start">
              <View
                className="mr-3 h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: categoryColor.bg }}>
                <Ionicons name="information-circle-outline" size={18} color={categoryColor.text} />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold" style={{ color: categoryColor.text }}>
                  {CATEGORY_LABELS[permit.category]}
                </Text>
                <Text className="text-[15px] font-bold leading-5 text-ink-800">{datasetLabel}</Text>
                <Text className="mt-1.5 text-[13px] leading-5 text-stone-600">
                  {categoryDescription}
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
          <InfoRow icon="layers-outline" label="Dataset" value={datasetLabel} isLast />
        </View>

        {/* Tags — each is a shortcut into the feed filtered to that topic tag
            (the etichetta analog of the street/zone cross-nav above). Reuses the
            feed's `tag` deep link so "what does this tag mean as a filter" stays a
            single source of truth. Only canonical tag keys navigate; an unknown
            key (no label) renders as a plain, non-tappable badge. */}
        {tags.length > 0 && (
          <View
            className="mt-3 rounded-2xl bg-white p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Text className="mb-2 text-xs font-semibold text-stone-600">Etichette</Text>
            <View className="flex-row flex-wrap">
              {tags.map((t) => {
                const label = TAG_LABELS[t];
                if (!label) {
                  return (
                    <View key={t} className="mb-2 mr-2 rounded-full bg-parchment-200 px-3.5 py-1.5">
                      <Text className="text-sm font-medium text-stone-600">{t}</Text>
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={t}
                    onPress={() =>
                      router.navigate({
                        pathname: '/(tabs)',
                        params: { tag: t, t: String(Date.now()) },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Filtra le pratiche per ${label}`}
                    accessibilityHint="Apre il feed con questa etichetta come filtro"
                    className="mb-2 mr-2 flex-row items-center rounded-full bg-parchment-200 py-1.5 pl-3.5 pr-2.5">
                    <Text className="text-sm font-medium text-stone-600">{label}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={13}
                      color="#8B7355"
                      style={{ marginLeft: 3 }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Imposta come casa — anchor the feed's "Vicino a casa" radius filter on
            this permit's location. Shown only for a row that carries a coordinate
            (geo-dotted categories + geocoded edilizia); a coordinate-less row (a
            not-yet-geocoded edilizia) simply omits it. When this permit already IS
            the home, the card confirms it and offers to remove the anchor. */}
        {homeCoords &&
          (isHome ? (
            <View
              className="mt-3 flex-row items-center rounded-2xl border-l-[3px] border-brick-600 bg-brick-50 p-4"
              style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-brick-100">
                <Ionicons name="home" size={18} color="#9B2335" />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-brick-700">
                  Questa è la tua casa
                </Text>
                <Text className="text-xs text-stone-600">
                  Il feed può filtrare le voci vicine con «Vicino a casa».
                </Text>
              </View>
              <Pressable
                onPress={handleClearHome}
                accessibilityRole="button"
                accessibilityLabel="Rimuovi casa"
                hitSlop={8}
                className="rounded-full bg-white px-3 py-1.5">
                <Text className="text-xs font-semibold text-stone-600">Rimuovi</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleSetHome}
              accessibilityRole="button"
              accessibilityLabel="Imposta come casa"
              accessibilityHint="Filtra il feed sulle voci vicine a questa posizione"
              className="mt-3 flex-row items-center rounded-2xl bg-white p-4"
              style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-parchment-100">
                <Ionicons name="home-outline" size={18} color="#8B7355" />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-ink-800">Imposta come casa</Text>
                <Text className="text-xs text-stone-500">
                  Filtra il feed sulle voci vicine con «Vicino a casa»
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#a89888" />
            </Pressable>
          ))}

        {/* Nei dintorni — other permits within ~500 m, nearest first. Catches the
            cross-street neighbour that the quartiere-wide "Nella stessa zona" and
            the exact-street "Altre pratiche in <via>" cards both miss. Renders only
            for geo-dotted rows (cantieri/commercio/eventi/segnalazioni) — edilizia
            has no coordinate yet, so its detail simply omits this card. */}
        {nearby.length > 0 && (
          <View
            className="mt-3 rounded-2xl bg-white px-5 py-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View className="mb-1 flex-row items-center">
              <Ionicons name="navigate-circle-outline" size={15} color="#8B7355" />
              <Text className="ml-1.5 text-xs font-semibold text-stone-600">Nei dintorni</Text>
              <Text className="ml-1 text-xs text-stone-500">· entro 500 m</Text>
            </View>
            {nearby.map((n, i) => (
              <NearbyRow
                key={n.item.id}
                permit={n.item}
                meters={n.meters}
                isLast={i === nearby.length - 1}
                onPress={() => router.push(`/permit/${n.item.id}`)}
              />
            ))}
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
