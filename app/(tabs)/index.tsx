import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  RefreshControl,
  TextInput,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDb } from '../../lib/db';
import {
  getPermits,
  countPermits,
  countNewPermits,
  getNewSourceIds,
  markAllSeen,
  parsePermitTags,
  SORT_LABELS,
  type Permit,
  type FeedFilters,
  type SortOption,
} from '../../lib/queries';
import { loadPreferences, savePreferences } from '../../lib/preferences';
import { shouldShowHomeHint } from '../../lib/home-hint';
import { listFavoriteIds, toggleFavorite } from '../../lib/favorites';
import { listNotePreviews } from '../../lib/notes';
import { applyFavoriteToggle } from '../../lib/favorite-set';
import { feedCardDate } from '../../lib/feed-card-date';
import { parseZoneParam } from '../../lib/zone-param';
import { parseTagParam } from '../../lib/tag-param';
import { parseStatusParam } from '../../lib/status-param';
import { parseNewParam } from '../../lib/new-param';
import { debounce } from '../../lib/debounce';
import { shouldShowScrollTop } from '../../lib/scroll-top';
import { applySeenToList } from '../../lib/mark-seen';
import { groupPermitsBySection } from '../../lib/feed-sections';
import { sectionCountLabel } from '../../lib/section-count-label';
import { buildResultCount } from '../../lib/result-count-label';
import { recordNoun } from '../../lib/record-noun';
import { formatSearchTerm } from '../../lib/search-empty-message';
import { formatProtocol } from '../../lib/format-protocol';
import { formatItDate } from '../../lib/format-date';
import { assertNever } from '../../lib/assert-never';
import {
  getCantiereExtra,
  getCommercioExtra,
  getEventoExtra,
  getSegnalazioneExtra,
  getCoords,
} from '../../lib/permit-extra';
import {
  homeFilterActive,
  filterPermitsNearHome,
  formatRadiusLabel,
  DEFAULT_HOME_RADIUS_M,
  type HomeLocation,
} from '../../lib/home-location';
import { distanceLabelFromHome } from '../../lib/home-distance';
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_HAS_STATUS_SIGNAL,
  type Category,
} from '../../lib/sources';
import {
  effectiveFeedCategories,
  showFilingSubRow,
  categoryChoices,
  showCategoryRow as shouldShowCategoryRow,
} from '../../lib/feed-category';
import { applicableStatuses, pruneStatusesForCategory } from '../../lib/category-statuses';
import {
  buildActiveFilterChips,
  ZONES_CHIP_KEY,
  PERIOD_CHIP_KEY,
  ONLY_NEW_CHIP_KEY,
  ONLY_FAVORITES_CHIP_KEY,
  ONLY_NOTED_CHIP_KEY,
  ONLY_NEAR_HOME_CHIP_KEY,
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
  in_corso: '#3b82f6',
  in_programma: '#8b5cf6',
};

const STATUS_KEYS = Object.keys(STATUS_LABELS);
const TAG_KEYS = Object.keys(TAG_LABELS);

// "Vicino a casa" is a JS post-filter (haversine over the row's extra.lat/lon,
// which no SQL predicate can express), so its query loads a large unpaged window
// and filters it in memory instead of the normal LIMIT/OFFSET page. The cap
// bounds that scan; a radius filter yields a small near-home set well under it,
// but if a dense DB ever exceeds it the feed shows the nearest `HOME_SCAN_CAP`
// matches (never a silent wrong page) — pagination is disabled while active.
const HOME_SCAN_CAP = 2000;

// Stable empty distance map for the non-radius feed, so leaving radius mode
// doesn't allocate a fresh Map on every reset. Never mutated.
const EMPTY_DISTANCE_MAP: ReadonlyMap<string, string> = new Map();

/* ── Tag Badge ──────────────────────────────────── */

function TagBadge({ tag }: { tag: string }) {
  return (
    <View className="mr-1 mt-1 rounded-full bg-parchment-200 px-2.5 py-0.5">
      <Text className="text-xs font-medium text-stone-600">{TAG_LABELS[tag] ?? tag}</Text>
    </View>
  );
}

/* ── Card meta rows ─────────────────────────────── */

/** A muted label+date footer row ("Richiesta 15/11/2024") with a leading glyph. */
function CardDateRow({
  icon,
  label,
  date,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  date: string;
}) {
  return (
    <View className="mt-2 flex-row items-center">
      <Ionicons name={icon} size={12} color="#70593f" />
      <Text className="ml-1 text-xs text-stone-600">
        <Text className="font-semibold">{label}</Text> {date}
      </Text>
    </View>
  );
}

/** The card headline text, shared by every non-edilizia body. */
function CardHeadline({ text }: { text: string }) {
  return (
    <Text className="text-[15px] font-semibold leading-5 text-ink-800" numberOfLines={2}>
      {text}
    </Text>
  );
}

/* ── Per-category card bodies ───────────────────── */

/** Edilizia body — byte-identical to the original card: address headline,
 *  zone, procedimento, sort-matched date + protocol footer, then topic tags. */
function EdiliziaBody({ permit, sort }: { permit: Permit; sort: SortOption }) {
  const tags = parsePermitTags(permit.tags);
  // Date shown in the footer, chosen + labelled to match the active sort so the
  // card never displays a date that disagrees with how the feed is ordered.
  const cardDate = feedCardDate(permit, sort);
  return (
    <>
      <CardHeadline text={permit.address ?? 'Indirizzo non disponibile'} />
      {permit.zone && <Text className="mt-0.5 text-sm text-stone-500">{permit.zone}</Text>}
      {permit.procedimento && (
        <Text className="mt-1 text-sm leading-5 text-ink-500" numberOfLines={2}>
          {permit.procedimento}
        </Text>
      )}
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
          <Ionicons name="pricetag-outline" size={12} color="#70593f" />
          <Text className="ml-1 text-xs text-stone-600">{formatProtocol(permit.source_id)}</Text>
        </View>
      </View>
      {tags.length > 0 && (
        <View className="mt-1.5 flex-row flex-wrap">
          {tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </View>
      )}
    </>
  );
}

/** Cantieri body — title headline, address + zone, works date range, and the
 *  traffic-change measure (the field residents care about) as an amber callout. */
function CantieriBody({ permit }: { permit: Permit }) {
  const extra = getCantiereExtra(permit.extra);
  const start = formatItDate(permit.source_updated_at);
  const end = formatItDate(permit.date_issued);
  const range =
    start && end
      ? `Dal ${start} al ${end}`
      : start
        ? `Dal ${start}`
        : end
          ? `Fino al ${end}`
          : null;
  return (
    <>
      <CardHeadline text={permit.title ?? 'Cantiere'} />
      {permit.address && <Text className="mt-0.5 text-sm text-stone-500">{permit.address}</Text>}
      {permit.zone && <Text className="mt-0.5 text-sm text-stone-500">{permit.zone}</Text>}
      {range && (
        <View className="mt-2 flex-row items-center">
          <Ionicons name="calendar-outline" size={12} color="#70593f" />
          <Text className="ml-1 text-xs text-stone-600">{range}</Text>
        </View>
      )}
      {extra.trafficchangesmeasure && (
        <View
          className="mt-2 flex-row items-center rounded-lg px-2.5 py-1.5"
          style={{ backgroundColor: CATEGORY_COLORS.cantieri.bg }}>
          <Ionicons name="warning-outline" size={13} color={CATEGORY_COLORS.cantieri.text} />
          <Text
            className="ml-1.5 flex-1 text-xs leading-4"
            style={{ color: CATEGORY_COLORS.cantieri.text }}
            numberOfLines={2}>
            {extra.trafficchangesmeasure}
          </Text>
        </View>
      )}
    </>
  );
}

/** Commercio body — tipo_intervento headline, address + zone, the area as a
 *  muted qualifier, and the request date. Familiar istanza→esito shape. */
function CommercioBody({ permit }: { permit: Permit }) {
  const extra = getCommercioExtra(permit.extra);
  const date = formatItDate(permit.source_updated_at);
  return (
    <>
      <CardHeadline text={permit.title ?? 'Attività commerciale'} />
      {permit.address && <Text className="mt-0.5 text-sm text-stone-500">{permit.address}</Text>}
      {permit.zone && <Text className="mt-0.5 text-sm text-stone-500">{permit.zone}</Text>}
      {extra.area && <Text className="mt-1 text-sm text-ink-500">{extra.area}</Text>}
      {date && <CardDateRow icon="document-text-outline" label="Richiesta" date={date} />}
    </>
  );
}

/** Eventi body — date(s) FIRST and prominent (what matters for an event), then
 *  title, address + zone, an "Online" pill, and the category tag chips. */
function EventiBody({ permit }: { permit: Permit }) {
  const extra = getEventoExtra(permit.extra);
  const tags = parsePermitTags(permit.tags);
  // Event start lives in `extra` (source_updated_at is NULL for eventi — see
  // source-eventi.ts / build-feed-query.ts); end is the closing date.
  const start = formatItDate(extra.start ?? null);
  const end = formatItDate(permit.date_issued);
  const dateLabel =
    start && end && end !== start
      ? `Dal ${start} al ${end}`
      : start
        ? `Il ${start}`
        : end
          ? `Il ${end}`
          : null;
  return (
    <>
      {dateLabel && (
        <View className="mb-1 flex-row items-center">
          <Ionicons name="calendar-outline" size={13} color={CATEGORY_COLORS.eventi.text} />
          <Text className="ml-1.5 text-xs font-semibold text-stone-600">{dateLabel}</Text>
        </View>
      )}
      <CardHeadline text={permit.title ?? 'Evento'} />
      {permit.address && <Text className="mt-0.5 text-sm text-stone-500">{permit.address}</Text>}
      {permit.zone && <Text className="mt-0.5 text-sm text-stone-500">{permit.zone}</Text>}
      {extra.online === 'SI' && (
        <View
          className="mt-2 flex-row items-center self-start rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: CATEGORY_COLORS.eventi.bg }}>
          <Ionicons name="videocam-outline" size={12} color={CATEGORY_COLORS.eventi.text} />
          <Text
            className="ml-1 text-xs font-semibold"
            style={{ color: CATEGORY_COLORS.eventi.text }}>
            Online
          </Text>
        </View>
      )}
      {tags.length > 0 && (
        <View className="mt-1.5 flex-row flex-wrap">
          {tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </View>
      )}
    </>
  );
}

/** Segnalazioni body — the sottocategoria-chain headline, the proximity zone as
 *  the location line (this source has NO address), the quartiere, and the report
 *  date. Never renders the edilizia "Indirizzo non disponibile" placeholder. */
function SegnalazioniBody({ permit }: { permit: Permit }) {
  const extra = getSegnalazioneExtra(permit.extra);
  const date = formatItDate(permit.source_updated_at);
  return (
    <>
      <CardHeadline text={permit.title ?? 'Segnalazione'} />
      {extra.nome_zona_prossimita && (
        <View className="mt-0.5 flex-row items-center">
          <Ionicons name="location-outline" size={12} color="#8B7355" />
          <Text className="ml-1 text-sm text-stone-500">{extra.nome_zona_prossimita}</Text>
        </View>
      )}
      {permit.zone && <Text className="mt-0.5 text-sm text-stone-500">{permit.zone}</Text>}
      {date && <CardDateRow icon="megaphone-outline" label="Segnalata" date={date} />}
    </>
  );
}

/**
 * Dispatch the card body by civic category. A real exhaustive `switch` over the
 * `Category` union (CLAUDE.md's compiler-enforced-exhaustiveness rule): the
 * `default` calls `assertNever`, so adding a sixth category without a body here
 * fails `npx tsc --noEmit` rather than silently rendering nothing.
 */
function CardBody({ permit, sort }: { permit: Permit; sort: SortOption }) {
  switch (permit.category) {
    case 'edilizia':
      return <EdiliziaBody permit={permit} sort={sort} />;
    case 'cantieri':
      return <CantieriBody permit={permit} />;
    case 'commercio':
      return <CommercioBody permit={permit} />;
    case 'eventi':
      return <EventiBody permit={permit} />;
    case 'segnalazioni':
      return <SegnalazioniBody permit={permit} />;
    default:
      return assertNever(permit.category);
  }
}

/* ── Permit Card ────────────────────────────────── */

function PermitCard({
  permit,
  isSaved,
  notePreview,
  distanceLabel,
  sort,
  onPress,
  onToggleSave,
}: {
  permit: Permit;
  isSaved: boolean;
  /** One-line preview of this permit's personal note, or null when it has none. */
  notePreview: string | null;
  /** Approx distance from home ("~350 m") when the "Vicino a casa" filter is
   *  active, else null — the card shows a proximity chip only in radius mode. */
  distanceLabel: string | null;
  sort: SortOption;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const hasNote = notePreview != null && notePreview !== '';
  // Categories whose stored `status` carries real signal (edilizia/cantieri/
  // commercio); eventi/segnalazioni statuses are constants — no dot/label.
  const showStatus = CATEGORY_HAS_STATUS_SIGNAL[permit.category];
  const statusLabel = STATUS_LABELS[permit.status] ?? permit.status_raw;
  const dotColor = STATUS_DOT[permit.status] ?? '#9ca3af';
  // The top-left badge: the filing-type acronym for edilizia (its own color), the
  // category label for every other source (its category color).
  const isEdilizia = permit.category === 'edilizia';
  const badge = isEdilizia
    ? {
        bg: FILING_COLORS[permit.filing_type].bg,
        text: FILING_COLORS[permit.filing_type].text,
        label: permit.filing_type,
      }
    : {
        bg: CATEGORY_COLORS[permit.category].bg,
        text: CATEGORY_COLORS[permit.category].text,
        label: CATEGORY_LABELS[permit.category],
      };

  const a11yLabel = [
    badge.label,
    showStatus ? statusLabel : null,
    permit.is_new === 1 ? 'nuovo' : null,
    isSaved ? 'salvata' : null,
    hasNote ? 'con nota' : null,
    permit.title ?? permit.address ?? null,
    permit.zone,
    distanceLabel ? `a ${distanceLabel} da casa` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Apri i dettagli"
      className="mx-4 mb-2.5 rounded-xl bg-white p-4"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      }}>
      {/* Top row: category/filing badge + status + NUOVO/bookmark */}
      <View className="mb-2 flex-row items-center">
        <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: badge.bg }}>
          <Text className="text-xs font-bold" style={{ color: badge.text }}>
            {badge.label}
          </Text>
        </View>
        {showStatus && (
          <View className="ml-2 flex-row items-center">
            <View className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
            <Text className="text-xs font-medium text-stone-500">{statusLabel}</Text>
          </View>
        )}
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
            accessibilityLabel={isSaved ? 'Rimuovi dai salvati' : 'Salva'}
            accessibilityState={{ selected: isSaved }}>
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isSaved ? '#9B2335' : '#a89888'}
            />
          </Pressable>
        </View>
      </View>

      {/* Category-specific body (exhaustive switch over Category) */}
      <CardBody permit={permit} sort={sort} />

      {/* Proximity chip — only in "Vicino a casa" radius mode. Answers "how far
          is this from MY home?" right on the card (the radius filter already
          narrowed the feed; this quantifies each hit). Home glyph + brick accent
          ties it to the same home identity as the filter toggle. */}
      {distanceLabel && (
        <View className="mt-2 flex-row items-center self-start rounded-full bg-parchment-200 px-2.5 py-0.5">
          <Ionicons name="home" size={11} color="#9B2335" />
          <Text className="ml-1 text-xs font-semibold text-stone-600">{distanceLabel} da casa</Text>
        </View>
      )}

      {/* Personal note — the resident's own tracking note on this permit (see the
          detail "Le mie note"), surfaced right in the feed so they can read WHAT
          they wrote, not just that a note exists. Brick-tinted strip in the user's
          own voice, distinct from the open-data facts above. */}
      {hasNote && (
        <View className="mt-2 flex-row items-center rounded-lg border-l-[3px] border-brick-600 bg-brick-50 px-2.5 py-1.5">
          <Ionicons name="create" size={13} color="#9B2335" />
          <Text
            className="ml-1.5 flex-1 text-xs leading-4 text-brick-700"
            numberOfLines={1}
            accessibilityLabel={`Nota personale: ${notePreview}`}>
            {notePreview}
          </Text>
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
        Scarica le voci dalla scheda Aggiorna.
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
      <Text className="text-lg font-bold text-ink-800">Nessuna voce salvata</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-stone-500">
        Tocca il segnalibro <Ionicons name="bookmark-outline" size={13} color="#8B7355" /> su una
        voce per salvarla e ritrovarla qui.
      </Text>
      <Pressable
        onPress={onShowAll}
        accessibilityRole="button"
        accessibilityLabel="Mostra tutte le voci"
        className="mt-4 rounded-xl bg-parchment-200 px-5 py-2.5">
        <Text className="font-semibold text-stone-600">Mostra tutte le voci</Text>
      </Pressable>
    </View>
  );
}

function EmptyNotedState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <View
      className="mx-6 mt-16 items-center rounded-2xl bg-white p-8"
      style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brick-50">
        <Ionicons name="create-outline" size={28} color="#9B2335" />
      </View>
      <Text className="text-lg font-bold text-ink-800">Nessuna voce con note</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-stone-500">
        Apri una voce e tocca «Le mie note» per annotarla; comparirà qui.
      </Text>
      <Pressable
        onPress={onShowAll}
        accessibilityRole="button"
        accessibilityLabel="Mostra tutte le voci"
        className="mt-4 rounded-xl bg-parchment-200 px-5 py-2.5">
        <Text className="font-semibold text-stone-600">Mostra tutte le voci</Text>
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
        Nessuna voce corrisponde a «{term}». Controlla l’ortografia o prova un altro termine.
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
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brick-50">
        <Ionicons name="filter-outline" size={28} color="#9B2335" />
      </View>
      <Text className="text-lg font-bold text-ink-800">Nessun risultato</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-stone-500">
        Nessuna voce corrisponde ai filtri attivi. Prova ad allargarli o azzerarli.
      </Text>
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
  activeCategory,
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
  onlyNoted,
  toggleOnlyNoted,
  home,
  onlyNearHome,
  toggleOnlyNearHome,
  homeRadiusMeters,
  period,
  setPeriod,
  sort,
  setSort,
  activeCount,
  onReset,
}: {
  activeCategory: Category | null;
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
  onlyNoted: boolean;
  toggleOnlyNoted: () => void;
  /** The user's home anchor; the near-home toggle only shows when this is set. */
  home: HomeLocation | null;
  onlyNearHome: boolean;
  toggleOnlyNearHome: () => void;
  homeRadiusMeters: number;
  period: FeedPeriod;
  setPeriod: (p: FeedPeriod) => void;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  activeCount: number;
  onReset: () => void;
}) {
  return (
    <View className="border-b border-stone-200 bg-white px-4 pb-3">
      {/* Panel header: title + an in-panel "Azzera" reset. The collapsed
          active-filter chip row (with its own "Cancella") is hidden while the
          panel is open, so without this the only way to clear every filter from
          inside the panel was to un-toggle each one — the reset lives here now. */}
      <View className="mb-3 mt-1 flex-row items-center justify-between">
        <Text className="text-sm font-bold text-ink-800">Filtri</Text>
        {activeCount > 0 && (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel={`Azzera ${activeCount} filtri attivi`}
            hitSlop={8}
            className="flex-row items-center rounded-full bg-brick-50 px-3 py-1">
            <Ionicons name="refresh" size={13} color="#9B2335" />
            <Text className="ml-1 text-xs font-semibold text-brick-600">Azzera</Text>
          </Pressable>
        )}
      </View>

      {/* Quick toggles: only new / only saved / only noted. Wraps so the third
          pill drops to a second line on narrow screens instead of clipping. */}
      <View className="mb-2 flex-row flex-wrap">
        <Pressable
          onPress={toggleOnlyNew}
          accessibilityRole="button"
          accessibilityLabel="Solo nuovi"
          accessibilityState={{ selected: onlyNew }}
          className={`mb-1.5 mr-2 flex-row items-center self-start rounded-full px-3.5 py-2 ${
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
          className={`mb-1.5 mr-2 flex-row items-center self-start rounded-full px-3.5 py-2 ${
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
        <Pressable
          onPress={toggleOnlyNoted}
          accessibilityRole="button"
          accessibilityLabel="Solo con note"
          accessibilityState={{ selected: onlyNoted }}
          className={`mb-1.5 flex-row items-center self-start rounded-full px-3.5 py-2 ${
            onlyNoted ? 'bg-brick-600' : 'bg-parchment-100'
          }`}>
          <Ionicons
            name={onlyNoted ? 'create' : 'create-outline'}
            size={14}
            color={onlyNoted ? 'white' : '#8B7355'}
          />
          <Text
            className={`ml-1.5 text-xs font-semibold ${onlyNoted ? 'text-white' : 'text-stone-500'}`}>
            Solo con note
          </Text>
        </Pressable>
        {/* "Vicino a casa" — only offered once a home is anchored (from a permit
            detail's "Imposta come casa"); narrows the feed to rows within the
            chosen radius of home. Names the radius so the scope is legible. */}
        {home && (
          <Pressable
            onPress={toggleOnlyNearHome}
            accessibilityRole="button"
            accessibilityLabel={`Vicino a casa, entro ${formatRadiusLabel(homeRadiusMeters)}`}
            accessibilityState={{ selected: onlyNearHome }}
            className={`mb-1.5 ml-2 flex-row items-center self-start rounded-full px-3.5 py-2 ${
              onlyNearHome ? 'bg-brick-600' : 'bg-parchment-100'
            }`}>
            <Ionicons
              name={onlyNearHome ? 'home' : 'home-outline'}
              size={14}
              color={onlyNearHome ? 'white' : '#8B7355'}
            />
            <Text
              className={`ml-1.5 text-xs font-semibold ${onlyNearHome ? 'text-white' : 'text-stone-500'}`}>
              Vicino a casa · {formatRadiusLabel(homeRadiusMeters)}
            </Text>
          </Pressable>
        )}
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
            className={`mb-1.5 mr-1.5 rounded-full border px-3 py-1.5 ${
              activeZones.has(zone)
                ? 'border-brick-600 bg-brick-50'
                : 'border-transparent bg-parchment-100'
            }`}>
            <Text
              className={`text-xs font-semibold ${activeZones.has(zone) ? 'text-brick-700' : 'text-stone-500'}`}>
              {zone}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Status chips — scoped to the active category so no dead filter is offered.
          `applicableStatuses` returns null under "Tutte" (show every status: each can
          match some row), an empty set for a no-signal category (eventi/segnalazioni,
          whose status is a constant hidden on the card → hide the whole section), or
          the category's own vocabulary when a single signal-category chip is active. */}
      {(() => {
        const applicable = applicableStatuses(activeCategory);
        // No-signal category selected: the Stato section is meaningless — hide it.
        if (applicable !== null && applicable.size === 0) return null;
        const keys =
          applicable === null ? STATUS_KEYS : STATUS_KEYS.filter((s) => applicable.has(s));
        return (
          <>
            <Text className="mb-1.5 text-xs font-semibold text-stone-600">Stato</Text>
            <View className="flex-row flex-wrap">
              {keys.map((s) => {
                const active = activeStatuses.has(s);
                const dot = STATUS_DOT[s] ?? '#9ca3af';
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleStatus(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Stato ${STATUS_LABELS[s]}`}
                    accessibilityState={{ selected: active }}
                    className={`mb-1.5 mr-1.5 flex-row items-center rounded-full border px-3 py-1.5 ${
                      active
                        ? 'border-brick-600 bg-brick-50'
                        : 'border-transparent bg-parchment-100'
                    }`}>
                    <View
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: dot }}
                    />
                    <Text
                      className={`text-xs font-semibold ${active ? 'text-brick-700' : 'text-stone-500'}`}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        );
      })()}

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
              className={`mb-1.5 mr-1.5 rounded-full border px-3 py-1.5 ${
                active ? 'border-brick-600 bg-brick-50' : 'border-transparent bg-parchment-100'
              }`}>
              <Text
                className={`text-xs font-semibold ${active ? 'text-brick-700' : 'text-stone-500'}`}>
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

/* ── Home discoverability hint ──────────────────── */

/** One-time dismissible banner teaching the "Vicino a casa" capability. The
 *  radius filter only appears in the FilterPanel once a home is anchored, and a
 *  home is set from a permit detail — so without this a first-time feed browser
 *  never learns the place-aware feature exists. Shown only while no home is set
 *  (see shouldShowHomeHint); setting one retires it, an explicit dismiss persists.
 *  Brick home-glyph on a parchment card ties it to the same home identity as the
 *  filter toggle + Settings "Casa" card. */
function HomeHintBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View className="mx-4 mb-2 mt-1 flex-row items-center rounded-xl border border-brick-100 bg-brick-50 py-2.5 pl-3 pr-2">
      <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-full bg-white">
        <Ionicons name="home" size={16} color="#9B2335" />
      </View>
      <View className="flex-1 pr-1">
        <Text className="text-[13px] font-bold text-ink-800">Cosa si costruisce vicino a te?</Text>
        <Text className="mt-0.5 text-xs leading-4 text-stone-600">
          Apri una voce e tocca «Imposta come casa» per filtrare il feed sulle voci vicine.
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Nascondi il suggerimento «Vicino a casa»"
        className="h-7 w-7 items-center justify-center rounded-full">
        <Ionicons name="close" size={16} color="#9B2335" />
      </Pressable>
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
      <Text className="text-xs font-semibold text-stone-500">{sectionCountLabel(count)}</Text>
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
  // Deep link from a detail etichetta tap carries `tag` (a canonical tag key) +
  // the shared `t` nonce; it narrows the feed to that single tag.
  // Deep link from the Sync "Per Stato" rows carries `status` (a canonical status
  // key) + the shared `t` nonce; it narrows the feed to that single outcome.
  const {
    zone: zoneParam,
    q: searchParam,
    tag: tagParam,
    status: statusParam,
    new: newParam,
    t: linkNonce,
  } = useLocalSearchParams<{
    zone?: string;
    q?: string;
    tag?: string;
    status?: string;
    new?: string;
    t?: string;
  }>();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [resultCount, setResultCount] = useState<number | null>(null);
  // Unfiltered total (base prefs only) — lets the header say "12 di 480 pratiche"
  // when the view is narrowed, so the count reads as a slice not the whole set.
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [notePreviews, setNotePreviews] = useState<Map<string, string>>(new Map());
  // Per-card distance-from-home labels ("~350 m"), keyed by source_id. Populated
  // only while the "Vicino a casa" radius filter is active (the scan holds every
  // near-home row), empty otherwise so no chip renders off radius mode.
  const [nearHomeDistances, setNearHomeDistances] =
    useState<ReadonlyMap<string, string>>(EMPTY_DISTANCE_MAP);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Session-local category quick-filter: `null` = show all followed categories,
  // a value = narrow the feed to just that one. Independent of Settings ›
  // Interessi (never mutates the persisted follow-set). `followedCategories`
  // mirrors prefs.interests so the chip row can render before a reload; it is
  // refreshed from prefs on every reset load.
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [followedCategories, setFollowedCategories] = useState<Category[]>([]);

  const [activeTypes, setActiveTypes] = useState<Set<FilingType>>(new Set(FILING_TYPE_ORDER));
  const [activeZones, setActiveZones] = useState<Set<Quartiere>>(new Set(QUARTIERI));
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyNoted, setOnlyNoted] = useState(false);
  // "Vicino a casa" radius filter: the toggle plus the home anchor + radius it
  // reads (both mirrored from prefs on every reset load, like followedCategories).
  const [onlyNearHome, setOnlyNearHome] = useState(false);
  const [home, setHome] = useState<HomeLocation | null>(null);
  const [homeRadiusMeters, setHomeRadiusMeters] = useState<number>(DEFAULT_HOME_RADIUS_M);
  // Whether the one-time "Vicino a casa" discoverability hint has been dismissed.
  // Defaults true so it never flashes before the first prefs read resolves it.
  const [homeHintDismissed, setHomeHintDismissed] = useState(true);
  const [period, setPeriod] = useState<FeedPeriod>('all');
  const [sort, setSort] = useState<SortOption>('request_newest');
  // `searchInput` drives the text box (updates on every keystroke so typing
  // stays responsive); `search` is the applied query that drives the feed
  // reload. A trailing debounce copies the former into the latter so the
  // multi-query reload fires once the user pauses, not on every keystroke.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debouncedApplySearch = useMemo(() => debounce(setSearch, 250), []);
  const offsetRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);

  // "Back to top" floating button: shown once the feed is scrolled ~a screen down,
  // so a long infinite-scroll session has a one-tap way back to the newest permits.
  const listRef = useRef<SectionList<Permit>>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const onFeedScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShowScrollTop(shouldShowScrollTop(e.nativeEvent.contentOffset.y));
  }, []);
  const scrollToTop = useCallback(() => {
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });
  }, []);

  const activeFilterCount =
    (activeZones.size < QUARTIERI.length ? 1 : 0) +
    (period !== 'all' ? 1 : 0) +
    (activeStatuses.size > 0 ? 1 : 0) +
    (activeTags.size > 0 ? 1 : 0) +
    (onlyNew ? 1 : 0) +
    (onlyFavorites ? 1 : 0) +
    (onlyNoted ? 1 : 0) +
    (onlyNearHome && home ? 1 : 0) +
    (sort !== 'request_newest' ? 1 : 0);

  const loadPermits = useCallback(
    async (reset = false) => {
      const db = await getDb();
      const prefs = await loadPreferences();
      const newOffset = reset ? 0 : offsetRef.current;

      const filters: FeedFilters = {
        zones: activeZones.size < QUARTIERI.length ? [...activeZones] : prefs.zones,
        filingTypes: [...activeTypes].filter((t) => prefs.filingTypes.includes(t)),
        // Scope the feed to the categories the user follows (mirrors zones), then
        // apply the session-local category quick-filter on top: a selected
        // category narrows to just that one, `null` keeps all followed. An
        // orphaned selection falls back to all followed (never an empty feed).
        // The filing-type IN test above is edilizia-scoped in build-feed-query,
        // so a cantiere/event/… row is kept as long as its category is in scope.
        categories: effectiveFeedCategories(activeCategory, prefs.interests),
        // In-feed tag chips override the persistent settings tag filter for this
        // session; fall back to prefs.tags when no chip is active (mirrors zones).
        tags: activeTags.size > 0 ? [...activeTags] : prefs.tags,
        searchQuery: search || undefined,
        statuses: activeStatuses.size > 0 ? [...activeStatuses] : undefined,
        onlyNew: onlyNew || undefined,
        onlyFavorites: onlyFavorites || undefined,
        onlyNoted: onlyNoted || undefined,
        // Time-period filter → a request-date lower bound; `new Date()` is the
        // real current time (the clock read lives here, not in the pure helper),
        // and 'all' yields null → undefined (no bound).
        requestedAfter: periodStartDate(period, new Date()) ?? undefined,
        sort,
      };

      // Read the near-home filter from the freshly-loaded prefs (not the possibly
      // stale `home` state), so a reset triggered right after setting a home uses
      // the new anchor. homeFilterActive gates on both the toggle AND a home set.
      const nearHomeActive = homeFilterActive(prefs.home, onlyNearHome);

      if (reset) {
        // Mirror the followed set into state so the category quick-filter row can
        // render (and re-hydrate) without waiting on the next prefs read.
        setFollowedCategories(prefs.interests);
        // Mirror the home anchor + radius so the FilterPanel toggle and chip render.
        setHome(prefs.home);
        setHomeRadiusMeters(prefs.homeRadiusMeters);
        // Mirror the hint-dismissed flag so the discoverability banner can decide
        // to render (only when no home is set and the user hasn't dismissed it).
        setHomeHintDismissed(prefs.homeHintDismissed);
        const allFilters: FeedFilters = {
          zones: prefs.zones,
          filingTypes: prefs.filingTypes,
          categories: prefs.interests,
          tags: [],
        };
        const checkRows = await getPermits(db, allFilters, 1, 0);
        setHasData(checkRows.length > 0);
        // Unfiltered total (base prefs, no in-feed refinement) — the denominator
        // for the "N di TOTAL" header when the view is narrowed. (The filtered
        // result count is set below, after the rows are known: in radius mode it
        // is the post-haversine count, which no SQL COUNT can express.)
        setTotalCount(await countPermits(db, allFilters));
        // New (unseen) permits across the whole DB — drives the "mark all seen"
        // action; global, matching markAllSeen's global UPDATE.
        setNewCount(await countNewPermits(db));
        // Saved-permit ids, so each card can render its bookmark from one query
        // instead of an isFavorite call per visible row.
        setFavoriteIds(await listFavoriteIds(db));
        // Annotated permits → a one-line preview of each note, so a card can both
        // mark itself annotated and show WHAT the resident wrote, from one query —
        // same one-query-per-reload pattern as the bookmarks above.
        setNotePreviews(await listNotePreviews(db));
      }

      let rows: Permit[];
      if (nearHomeActive && prefs.home) {
        // Radius mode: load a large unpaged window, then haversine-filter it to
        // the home radius in JS — coords live in the `extra` JSON, so no SQL WHERE
        // can express proximity. Rows without a coordinate (not-yet-geocoded
        // edilizia) are dropped by filterPermitsNearHome.
        const home = prefs.home;
        const scan = await getPermits(db, filters, HOME_SCAN_CAP, 0);
        rows = filterPermitsNearHome(home, prefs.homeRadiusMeters, scan, (p) => getCoords(p.extra));
        // Label each kept card with its distance from home ("~350 m"). The rows
        // are already in memory and all carry a coord (null-coord rows were just
        // dropped), so this is a pure map — no extra query.
        const distances = new Map<string, string>();
        for (const p of rows) {
          const label = distanceLabelFromHome(home, getCoords(p.extra));
          if (label) distances.set(p.source_id, label);
        }
        setNearHomeDistances(distances);
      } else {
        rows = await getPermits(db, filters, 50, newOffset);
        // Leaving / not in radius mode: drop any stale distance labels on reset.
        if (reset) setNearHomeDistances(EMPTY_DISTANCE_MAP);
      }

      if (reset) {
        // In radius mode the filtered array IS the whole result, so its length is
        // the exact count; otherwise the paginated total comes from SQL COUNT.
        setResultCount(nearHomeActive ? rows.length : await countPermits(db, filters));
        setPermits(rows);
        offsetRef.current = nearHomeActive ? rows.length : 50;
      } else {
        setPermits((prev) => [...prev, ...rows]);
        offsetRef.current = newOffset + 50;
      }
      // Radius mode loaded everything in one window → no further pages to fetch.
      setHasMore(!nearHomeActive && rows.length === 50);
      setLoading(false);
    },
    [
      activeCategory,
      activeTypes,
      activeZones,
      activeStatuses,
      activeTags,
      onlyNew,
      onlyFavorites,
      onlyNoted,
      onlyNearHome,
      period,
      sort,
      search,
    ]
  );

  useEffect(() => {
    loadPermits(true);
  }, [loadPermits]);

  // When the feed regains focus (e.g. after opening a permit's detail, which
  // marks that permit read), fold the DB's still-unseen set into the loaded cards
  // IN PLACE — no reload, so scroll + pagination are preserved. applySeenToList
  // returns the same array when nothing changed, so the common "read nothing"
  // focus is a true no-op; only cards that lost their NUOVO flag re-render. This
  // never resets the list, so the worst case if focus never fires is simply the
  // pre-existing behavior (the badge clears on the next natural reload) — not a
  // scroll jump.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        const stillNew = await getNewSourceIds(db);
        if (!active) return;
        setNewCount(stillNew.size);
        setPermits((prev) => applySeenToList(prev, stillNew));
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  // Apply a `zone` deep link from the Sync screen: narrow the feed to that single
  // quartiere. Guarded by parseZoneParam so a junk/legacy value is ignored rather
  // than filtering the feed to nothing; refires on the nonce so re-tapping works.
  useEffect(() => {
    const zone = parseZoneParam(zoneParam);
    if (zone) setActiveZones(new Set([zone]));
    // linkNonce is listed only to retrigger this effect on a same-zone re-tap.
  }, [zoneParam, linkNonce]);

  // Apply a `tag` deep link from a permit detail's etichetta tap: narrow the feed
  // to that single topic tag. Guarded by parseTagParam so a junk/legacy key is
  // ignored rather than filtering to an impossible tag; refires on the nonce so
  // re-tapping the same tag re-applies it. Mirrors the zone deep link above.
  useEffect(() => {
    const tag = parseTagParam(tagParam);
    if (tag) setActiveTags(new Set([tag]));
  }, [tagParam, linkNonce]);

  // Apply a `status` deep link from the Sync "Per Stato" rows: narrow the feed to
  // that single outcome. Guarded by parseStatusParam so a junk/legacy value is
  // ignored rather than filtering to an impossible status; refires on the nonce so
  // re-tapping the same status re-applies it. Mirrors the zone/tag deep links.
  useEffect(() => {
    const status = parseStatusParam(statusParam);
    if (status) {
      // Clear the session category scope so the deep-linked status is always
      // applicable (the Sync "Per Stato" rows aggregate across categories) and its
      // chip stays visible in the now-unscoped Stato filter list.
      setActiveCategory(null);
      setActiveStatuses(new Set([status]));
    }
  }, [statusParam, linkNonce]);

  // Apply a `new` deep link from a "new permits" notification tap: pre-activate
  // the "Solo nuovi" filter so the resident lands on exactly the fresh permits
  // the notification announced. Guarded by parseNewParam so only the canonical
  // `'1'` token narrows the feed; refires on the nonce so a second notification
  // tap re-applies it. Mirrors the zone/tag deep links above.
  useEffect(() => {
    if (parseNewParam(newParam)) setOnlyNew(true);
  }, [newParam, linkNonce]);

  // Apply a `q` deep link from a permit detail's "Altre pratiche in <via>"
  // action: prefill the search box with the street name so the feed narrows to
  // that street. Ignored when blank; refires on the nonce so re-tapping works.
  // Applied immediately (both states + debounce cancelled) — a deep-link jump
  // should narrow the feed at once, not wait out the typing debounce.
  useEffect(() => {
    if (typeof searchParam === 'string' && searchParam.trim()) {
      debouncedApplySearch.cancel();
      setSearchInput(searchParam);
      setSearch(searchParam);
    }
  }, [searchParam, linkNonce, debouncedApplySearch]);

  // Feed the text box on every keystroke, but debounce the applied query.
  const onChangeSearch = useCallback(
    (text: string) => {
      setSearchInput(text);
      debouncedApplySearch(text);
    },
    [debouncedApplySearch]
  );

  // Clear the search box AND the applied query at once (used by empty-state /
  // reset actions); a pending debounce must be dropped so it can't re-apply.
  const clearSearch = useCallback(() => {
    debouncedApplySearch.cancel();
    setSearchInput('');
    setSearch('');
  }, [debouncedApplySearch]);

  // Drop any pending debounced reload when the screen unmounts.
  useEffect(() => debouncedApplySearch.cancel, [debouncedApplySearch]);

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

  // Permanently dismiss the "Vicino a casa" hint: flip local state at once (banner
  // vanishes) and persist so it never returns. Setting a home also retires it (the
  // banner is gated on home === null), so this only matters for a decline.
  const dismissHomeHint = useCallback(async () => {
    setHomeHintDismissed(true);
    await savePreferences({ homeHintDismissed: true });
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
    setActiveCategory(null);
    setActiveTypes(new Set(FILING_TYPE_ORDER));
    setActiveZones(new Set(QUARTIERI));
    setActiveStatuses(new Set());
    setActiveTags(new Set());
    setOnlyNew(false);
    setOnlyFavorites(false);
    setOnlyNoted(false);
    setOnlyNearHome(false);
    setPeriod('all');
    setSort('request_newest');
    clearSearch();
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
    onlyNoted,
    // Gate on a home being set so a cleared anchor can't leave a phantom chip
    // (the FilterPanel toggle is likewise hidden when there is no home).
    onlyNearHome: onlyNearHome && home !== null,
    homeRadiusLabel: formatRadiusLabel(homeRadiusMeters),
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

  // Category quick-filter derivation (pure, tested in feed-category.test.ts):
  // which categories the feed is scoped to, whether to show the category chip
  // row at all (≥2 followed), and whether the PDC/SCIA/CILA filing sub-row
  // applies (feed scoped to edilizia alone).
  const catChoices = categoryChoices(followedCategories);
  const showCategoryRow = shouldShowCategoryRow(followedCategories);
  const showFilingRow = showFilingSubRow(
    effectiveFeedCategories(activeCategory, followedCategories)
  );

  const removeFilter = (key: string) => {
    if (key === ZONES_CHIP_KEY) setActiveZones(new Set(QUARTIERI));
    else if (key === PERIOD_CHIP_KEY) setPeriod('all');
    else if (key === ONLY_NEW_CHIP_KEY) setOnlyNew(false);
    else if (key === ONLY_FAVORITES_CHIP_KEY) setOnlyFavorites(false);
    else if (key === ONLY_NOTED_CHIP_KEY) setOnlyNoted(false);
    else if (key === ONLY_NEAR_HOME_CHIP_KEY) setOnlyNearHome(false);
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
          placeholder="Cerca indirizzo, nota o protocollo..."
          placeholderTextColor="#a89888"
          value={searchInput}
          onChangeText={onChangeSearch}
          clearButtonMode="while-editing"
          accessibilityLabel="Cerca indirizzo, procedimento, nota o protocollo"
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

      {/* Category quick-filter — the primary always-visible scope row. Present
          only when ≥2 categories are followed (a lone category has nothing to
          switch between). "Tutte" clears the session narrowing; each category
          chip narrows the feed to that one, session-only (Settings › Interessi
          is untouched). Horizontally scrollable so all followed categories fit. */}
      {showCategoryRow && (
        <FadeScrollRow className="bg-white px-4 pb-2.5 pt-1">
          <Pressable
            onPress={() => setActiveCategory(null)}
            accessibilityRole="button"
            accessibilityLabel="Tutte le categorie"
            accessibilityState={{ selected: activeCategory === null }}
            className={`mr-2 rounded-full px-4 py-2 ${
              activeCategory === null ? 'bg-brick-600' : 'bg-parchment-100'
            }`}>
            <Text
              className={`text-sm font-bold ${
                activeCategory === null ? 'text-white' : 'text-stone-500'
              }`}>
              Tutte
            </Text>
          </Pressable>
          {catChoices.map((cat) => {
            const active = activeCategory === cat;
            const cc = CATEGORY_COLORS[cat];
            return (
              <Pressable
                key={cat}
                onPress={() => {
                  const next = active ? null : cat;
                  setActiveCategory(next);
                  // Drop any active status that can't match the new scope so the
                  // switch never leaves a now-hidden status silently emptying the feed.
                  setActiveStatuses((prev) => pruneStatusesForCategory(prev, next));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Categoria ${CATEGORY_LABELS[cat]}`}
                accessibilityState={{ selected: active }}
                className={`mr-2 flex-row items-center rounded-full px-4 py-2 ${active ? '' : 'bg-parchment-100'}`}
                style={active ? { backgroundColor: cc.bg } : undefined}>
                {/* Leading identity dot on the idle chip only — unifies this row
                    with every other category/status surface (Settings Interessi,
                    Sync legend, Stato chips) that prefixes CATEGORY_COLORS. The
                    selected chip already carries its color as the pill fill, so
                    the dot is dropped there to not fight it. */}
                {!active && (
                  <View
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: cc.text }}
                  />
                )}
                <Text
                  className={`text-sm font-bold ${active ? '' : 'text-stone-500'}`}
                  style={active ? { color: cc.text } : undefined}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </Pressable>
            );
          })}
        </FadeScrollRow>
      )}

      {/* Filing-type sub-row (PDC/SCIA/CILA) — edilizia-only, so shown only when
          the feed is scoped to edilizia alone (see showFilingSubRow). Hidden for
          a non-edilizia category or a mixed view, where the acronyms mean nothing. */}
      {showFilingRow && (
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
      )}

      {/* Active-filter summary — visible when the panel is collapsed */}
      {!filtersOpen && activeChips.length > 0 && (
        <ActiveFilterChips chips={activeChips} onRemove={removeFilter} onClearAll={resetFilters} />
      )}

      {/* Expandable filter panel */}
      {filtersOpen && (
        <FilterPanel
          activeCategory={activeCategory}
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
          onlyNoted={onlyNoted}
          toggleOnlyNoted={() => setOnlyNoted((v) => !v)}
          home={home}
          onlyNearHome={onlyNearHome}
          toggleOnlyNearHome={() => setOnlyNearHome((v) => !v)}
          homeRadiusMeters={homeRadiusMeters}
          period={period}
          setPeriod={setPeriod}
          sort={sort}
          setSort={setSort}
          activeCount={activeFilterCount}
          onReset={resetFilters}
        />
      )}

      {/* Result count — reflects the active filters + search; when the view is
          narrowed below the followed total it reads "N di TOTAL pratiche". */}
      {!loading && hasData && resultCount !== null && (
        <View className="flex-row items-center bg-parchment-100 px-4 pb-1 pt-2.5">
          {(() => {
            const rc = buildResultCount(resultCount, totalCount ?? resultCount);
            const shownFmt = rc.shown.toLocaleString('it-IT');
            const totalFmt = rc.total.toLocaleString('it-IT');
            return (
              <Text
                className="text-xs font-semibold text-stone-600"
                accessibilityRole="header"
                accessibilityLabel={
                  rc.showTotal ? `${rc.shown} di ${rc.total} ${rc.noun}` : `${rc.shown} ${rc.noun}`
                }>
                {shownFmt}
                {rc.showTotal ? ` di ${totalFmt}` : ''} {rc.noun}
              </Text>
            );
          })()}
          {/* Mark-all-seen — clears the NUOVO badges when unseen permits exist */}
          {newCount > 0 && (
            <Pressable
              onPress={handleMarkAllSeen}
              accessibilityRole="button"
              accessibilityLabel={`Segna ${newCount} ${recordNoun(newCount)} come ${newCount === 1 ? 'letta' : 'lette'}`}
              className="ml-auto flex-row items-center rounded-full bg-brick-50 px-3 py-1">
              <Ionicons name="checkmark-done" size={13} color="#9B2335" />
              <Text className="ml-1 text-xs font-semibold text-brick-600">Segna lette</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* "Vicino a casa" discoverability hint — one-time, only before a home is
          set (see shouldShowHomeHint); teaches the place-aware filter a first-time
          browser would otherwise never find. */}
      {!loading && shouldShowHomeHint({ home, dismissed: homeHintDismissed, hasData }) && (
        <HomeHintBanner onDismiss={dismissHomeHint} />
      )}

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.source_id}
        onScroll={onFeedScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <PermitCard
            permit={item}
            isSaved={favoriteIds.has(item.source_id)}
            notePreview={notePreviews.get(item.source_id) ?? null}
            distanceLabel={nearHomeDistances.get(item.source_id) ?? null}
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
          ) : onlyNoted && notePreviews.size === 0 ? (
            // "Solo con note" is on but no permit is annotated yet: same reasoning
            // as saved — teach the note gesture + a one-tap way out.
            <EmptyNotedState onShowAll={() => setOnlyNoted(false)} />
          ) : searchTermForEmpty ? (
            // A search is active and matched nothing: point at the likely culprit
            // (the query) and offer to clear ONLY the search, so the user's
            // carefully-set zone/type/tag filters survive.
            <EmptySearchState term={searchTermForEmpty} onClearSearch={clearSearch} />
          ) : (
            <EmptyFilterState onReset={resetFilters} />
          )
        }
      />

      {/* Back-to-top FAB — only while the feed is scrolled down and populated.
          Brick circle anchored bottom-right just above the tab bar; taps scroll
          the SectionList back to the newest permits. */}
      {showScrollTop && hasData && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Torna all'inizio dell'elenco"
          hitSlop={8}
          className="absolute bottom-5 right-4 h-12 w-12 items-center justify-center rounded-full bg-brick-600 shadow-lg"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          }}>
          <Ionicons name="chevron-up" size={26} color="#ffffff" />
        </Pressable>
      )}
    </View>
  );
}
