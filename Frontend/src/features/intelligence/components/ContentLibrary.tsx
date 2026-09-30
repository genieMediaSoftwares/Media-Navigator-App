import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { colors } from '@/constants/colors';
import { fetchMediaPage } from '@/features/intelligence/api';
import { RowsSkeleton } from '@/features/intelligence/components/IntelligenceSkeleton';
import { MediaRow } from '@/features/intelligence/components/MediaRow';
import { MediaTile, tileFromPost } from '@/features/intelligence/components/MediaTile';
import { FORMAT_LABELS } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { ContentFormat, IntelligencePost, MediaPeriod, MediaSort } from '@/types/api';

const PAGE_SIZE = 24;
const GRID_COLUMNS = 3;
const GRID_GAP = 3;
const SIDE_PADDING = 16;

const SORT_OPTIONS: { value: MediaSort; label: string }[] = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'interactions', label: 'Most interactions' },
  { value: 'likes', label: 'Most likes' },
  { value: 'comments', label: 'Most comments' },
  { value: 'views', label: 'Most views' },
];
const PERIOD_OPTIONS: { value: MediaPeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last 12 months' },
];
const PERFORMANCE_OPTIONS: { value: 'above' | 'below' | null; label: string }[] = [
  { value: null, label: 'All posts' },
  { value: 'above', label: 'Above account average' },
  { value: 'below', label: 'Below account average' },
];

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

function OptionGroup<T>({ title, options, value, onChange }: { title: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="mb-lg" accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Text className="mb-xs text-caption font-semibold uppercase tracking-wide text-neutral-500">{title}</Text>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.label}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            className="min-h-11 flex-row items-center justify-between active:bg-neutral-50"
          >
            <Text className={`text-body ${selected ? 'font-semibold text-primary' : 'text-navy'}`}>{option.label}</Text>
            {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

interface ContentLibraryProps {
  accountId: string;
  initialFormat?: ContentFormat | null;
  initialSort?: MediaSort;
  initialPerformance?: 'above' | 'below' | null;
  /** Rendered above the search field, scrolling with the content (e.g. a screen summary). */
  summary?: ReactNode;
}

/** Content library (the archive): every synced post, searchable, filterable and paginated server-side. */
export function ContentLibrary({ accountId, initialFormat = null, initialSort = 'recent', initialPerformance = null, summary }: ContentLibraryProps) {
  const router = useRouter();
  const params = { format: initialFormat ?? undefined, sort: initialSort, performance: initialPerformance ?? undefined };
  const { width } = useWindowDimensions();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<ContentFormat | null>(params.format ?? null);
  const [sort, setSort] = useState<MediaSort>(params.sort ?? 'recent');
  const [period, setPeriod] = useState<MediaPeriod>('all');
  const [performance, setPerformance] = useState<'above' | 'below' | null>(params.performance ?? null);
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<IntelligencePost[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  // Only formats that exist in this account's synced data are offered as filters.
  const overview = intelligenceSession.overview(accountId);
  const formatOptions: ContentFormat[] = overview ? overview.archive.formatCounts.map((f) => f.format) : ['REEL', 'POST', 'CAROUSEL', 'VIDEO'];

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(
    (offset: number) => fetchMediaPage({ accountId, q: search, format, sort, period, performance, offset, limit: PAGE_SIZE }),
    [accountId, search, format, sort, period, performance],
  );

  const loadFirstPage = useCallback(
    async (mode: 'load' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'load') setLoad({ status: 'loading' });
      else setRefreshing(true);
      try {
        const page = await fetchPage(0);
        if (id !== requestId.current) return; // a newer filter change superseded this request
        setItems(page.items);
        setTotal(page.total);
        setNextOffset(page.nextOffset);
        setLoad({ status: 'ready' });
      } catch (error) {
        if (id === requestId.current) setLoad({ status: 'error', message: error instanceof Error ? error.message : 'Unable to load media.' });
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    void loadFirstPage('load');
  }, [loadFirstPage]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore || load.status !== 'ready') return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextOffset);
      if (id !== requestId.current) return;
      setItems((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
    } catch {
      // Keep what is loaded; reaching the end again retries.
    } finally {
      setLoadingMore(false);
    }
  };

  const openPost = (post: IntelligencePost) => router.push({ pathname: '/intelligence/post/[id]', params: { id: post.id, accountId } });
  const activeFilterCount = (sort !== 'recent' ? 1 : 0) + (period !== 'all' ? 1 : 0) + (performance ? 1 : 0);
  const clearFilters = () => {
    setSearchInput('');
    setFormat(null);
    setSort('recent');
    setPeriod('all');
    setPerformance(null);
  };

  const tileSize = (width - SIDE_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  const header = (
    <View className="pb-sm">
      {summary}
      <View className="min-h-12 flex-row items-center rounded-full bg-neutral-100 px-lg">
        <Ionicons name="search" size={18} color={colors.neutral500} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search captions"
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          accessibilityLabel="Search captions"
          className="ml-sm flex-1 py-md text-body text-navy"
        />
        {searchInput ? (
          <Pressable onPress={() => setSearchInput('')} accessibilityRole="button" accessibilityLabel="Clear search" className="h-11 w-11 items-center justify-center">
            <Ionicons name="close-circle" size={18} color={colors.neutral400} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-lg mt-md" contentContainerClassName="px-lg">
        {[null, ...formatOptions].map((option) => {
          const selected = option === format;
          return (
            <Pressable
              key={option ?? 'all'}
              onPress={() => setFormat(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`mr-sm min-h-11 flex-row items-center justify-center rounded-full px-lg ${selected ? 'bg-navy' : 'bg-neutral-100'}`}
            >
              {option ? <View className="mr-xs h-2 w-2 rounded-full" style={{ backgroundColor: FORMAT_LABELS[option].color }} /> : null}
              <Text className={`text-label ${selected ? 'font-semibold text-white' : 'text-navy'}`}>{option ? FORMAT_LABELS[option].plural : 'All'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="mt-sm flex-row items-center">
        <Text className="flex-1 text-caption text-neutral-500" accessibilityLiveRegion="polite">
          {load.status === 'ready' ? `${total} item${total === 1 ? '' : 's'}` : ' '}
        </Text>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort and filter${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
          className="min-h-11 flex-row items-center px-sm"
        >
          <Ionicons name="options-outline" size={18} color={colors.primary} />
          <Text className="ml-xs text-label font-semibold text-primary">Sort & filter{activeFilterCount ? ` (${activeFilterCount})` : ''}</Text>
        </Pressable>
        <Pressable
          onPress={() => setView(view === 'list' ? 'grid' : 'list')}
          accessibilityRole="button"
          accessibilityLabel={view === 'list' ? 'Show as grid' : 'Show as list'}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name={view === 'list' ? 'grid-outline' : 'list-outline'} size={20} color={colors.navy} />
        </Pressable>
      </View>
    </View>
  );

  const empty =
    load.status === 'loading' ? (
      <RowsSkeleton rows={6} label="Loading media" />
    ) : load.status === 'error' ? (
      <ErrorState message={load.message} onRetry={() => void loadFirstPage('load')} />
    ) : (
      <EmptyState icon="search-outline" title="No media matches" message="Try a different search or clear the filters." action={{ label: 'Clear filters', onPress: clearFilters }} />
    );

  return (
    <View className="flex-1 bg-white">
      <FlatList
        key={view}
        data={load.status === 'ready' ? items : []}
        keyExtractor={(item) => item.id}
        numColumns={view === 'grid' ? GRID_COLUMNS : 1}
        columnWrapperStyle={view === 'grid' ? { gap: GRID_GAP } : undefined}
        contentContainerStyle={{ paddingHorizontal: SIDE_PADDING, paddingBottom: 48 }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          view === 'list' ? (
            <MediaRow post={item} onPress={() => openPost(item)} />
          ) : (
            <View style={{ marginBottom: GRID_GAP }}>
              <MediaTile item={tileFromPost(item)} width={tileSize} aspect={1.25} compact showDelta={performance !== null || sort === 'interactions'} onPress={() => openPost(item)} />
            </View>
          )
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirstPage('refresh')} tintColor={colors.primary} colors={[colors.primary]} />}
      />

      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Sort & filter" closeLabel="Show results">
        <OptionGroup title="Sort by" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        <OptionGroup title="Published" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
        <OptionGroup title="Performance" options={PERFORMANCE_OPTIONS} value={performance} onChange={setPerformance} />
        {activeFilterCount ? (
          <Pressable onPress={clearFilters} accessibilityRole="button" className="min-h-11 justify-center self-start">
            <Text className="text-label font-semibold text-primary">Reset</Text>
          </Pressable>
        ) : null}
      </BottomSheet>
    </View>
  );
}
