import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { PlatformLogoTile } from '@/features/home/components/PlatformDashboardCard';
import { describeIntelligenceError, FORMAT_LABELS, formatLabel } from '@/features/intelligence/labels';
import { useApiResource } from '@/hooks/useApiResource';
import { formatCompactNumber, formatDate } from '@/lib/format';
import { Analysis, AnalysisContentItem, AnalysisPeriod } from '@/types/analysis';

import { fetchAnalysisContent, fetchTrendsAi } from '../api';
import { ConfidenceMeter } from '../components/Primitives';
import { AnalysisCard, Provenance } from './Pieces';

type Tab = 'top' | 'improve' | 'topics' | 'ideas';
const TABS: { value: Tab; label: string }[] = [
  { value: 'top', label: 'Top Content' },
  { value: 'improve', label: 'Needs Improvement' },
  { value: 'topics', label: 'Trending Topics' },
  { value: 'ideas', label: 'Content Ideas' },
];

const CATEGORY_LABEL: Record<string, string> = {
  topic: 'Topic',
  format: 'Format',
  format_momentum: 'Format momentum',
  momentum: 'Engagement trend',
  caption: 'Captions',
  hashtags: 'Hashtags',
  length: 'Video length',
  timing: 'Timing',
  watch_time: 'Watch time',
  frequency: 'Posting frequency',
};

/** One compact content card: thumbnail with platform badge, title, two metrics, date, actions. */
function ContentCard({ item, width, onActions, onOpen }: { item: AnalysisContentItem; width: number; onActions: () => void; onOpen: () => void }) {
  const { post } = item;
  const format = formatLabel(post.format, item.platform);
  const first = post.metrics.views !== null ? { icon: 'eye-outline' as const, value: post.metrics.views } : post.metrics.likes !== null ? { icon: 'heart-outline' as const, value: post.metrics.likes } : null;
  const second = post.metrics.views !== null && post.metrics.likes !== null ? { icon: 'heart-outline' as const, value: post.metrics.likes } : post.metrics.comments !== null ? { icon: 'chatbubble-outline' as const, value: post.metrics.comments } : null;
  return (
    <View
      className="mr-sm overflow-hidden rounded-xl border border-neutral-100 bg-white"
      style={{ width, shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
    >
      {/* The actions button sits outside this one: nested buttons are invalid on web and confusing to tap. */}
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${platformOption(item.platform).name} ${format.singular}: ${post.caption ?? 'no caption'}`} className="active:opacity-90">
      <View style={{ width, height: width * 0.62, backgroundColor: FORMAT_LABELS[post.format].light }} className="items-center justify-center">
        {post.previewUrl ? (
          <Image source={{ uri: post.previewUrl }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={post.previewUrl} />
        ) : (
          <Ionicons name={FORMAT_LABELS[post.format].icon} size={22} color={FORMAT_LABELS[post.format].color} />
        )}
        {item.isVideo && post.previewUrl ? (
          <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(11,31,68,0.45)' }}>
            <Ionicons name="play" size={13} color={colors.white} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', top: 4, right: 4 }}>
          <PlatformLogoTile platform={item.platform} size={16} />
        </View>
      </View>
      <View className="px-1.5 pb-0.5 pt-1">
        <Text className="text-[10.5px] font-semibold text-navy" numberOfLines={1}>
          {post.caption ?? format.singular}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          {first ? (
            <>
              <Text className="text-[10px] font-semibold text-navy">{formatCompactNumber(first.value)}</Text>
              <Ionicons name={first.icon} size={10} color={colors.neutral500} style={{ marginHorizontal: 3 }} />
            </>
          ) : (
            <Text className="text-[9px] text-neutral-400">Not available</Text>
          )}
          {second ? (
            <>
              <Ionicons name={second.icon} size={10} color={colors.neutral500} style={{ marginRight: 2 }} />
              <Text className="text-[10px] font-semibold text-navy">{formatCompactNumber(second.value)}</Text>
            </>
          ) : null}
        </View>
      </View>
      </Pressable>
      <View className="flex-row items-center justify-between px-1.5 pb-1.5">
        <Text className="text-[9px] text-neutral-400" numberOfLines={1}>
          {post.publishedAt ? formatDate(post.publishedAt) : 'Undated'}
        </Text>
        <Pressable onPress={onActions} hitSlop={10} accessibilityRole="button" accessibilityLabel="More actions" className="-mr-1 px-1">
          <Ionicons name="ellipsis-vertical" size={13} color={colors.neutral500} />
        </Pressable>
      </View>
    </View>
  );
}

function ContentRow({ scope, period, type, accountId }: { scope: string; period: AnalysisPeriod; type: 'top' | 'improve'; accountId: string | null }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(Math.floor((Math.min(width, 520) - 32 - 3 * 8) / 4), 84);
  const fetcher = useCallback(() => fetchAnalysisContent({ scope, period, type, accountId, limit: 8 }), [scope, period, type, accountId]);
  const { state, reload } = useApiResource(fetcher);
  const [selected, setSelected] = useState<AnalysisContentItem | null>(null);

  const openPost = (item: AnalysisContentItem, analyze = false) =>
    router.push({ pathname: '/intelligence/post/[id]', params: { id: item.post.id, accountId: item.accountId, ...(analyze ? { analyze: '1' } : {}) } });

  if (state.status === 'loading') {
    return (
      <View className="flex-row" accessibilityRole="progressbar" accessibilityLabel="Loading content">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="mr-sm" style={{ width: cardWidth, height: cardWidth * 1.25 }}>
            <Skeleton className="h-full w-full rounded-xl" />
          </View>
        ))}
      </View>
    );
  }
  if (state.status !== 'success') return <ErrorState message={state.message} onRetry={reload} />;
  if (state.data.items.length === 0) {
    return (
      <Text className="py-md text-label font-normal text-neutral-500">
        {type === 'top' ? 'No scored posts published in this period.' : 'No posts in this period are far enough below your typical post (posts from the last 3 days are still collecting engagement).'}
      </Text>
    );
  }
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-lg" contentContainerClassName="px-lg">
        {state.data.items.map((item) => (
          <View key={item.post.id}>
            <ContentCard item={item} width={cardWidth} onOpen={() => openPost(item)} onActions={() => setSelected(item)} />
            {type === 'improve' && item.reasons[0] ? (
              <Text className="mr-sm mt-1 text-[9.5px] leading-[13px] text-warning" style={{ width: cardWidth }} numberOfLines={3}>
                {item.reasons[0].statement}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <BottomSheet visible={selected !== null} onClose={() => setSelected(null)} title="Content">
        {selected ? (
          <View>
            {selected.reasons.length > 0 ? (
              <View className="mb-lg">
                <Provenance kind="measured" />
                {selected.reasons.map((r) => (
                  <Text key={r.id} className="mt-xs text-label font-normal text-navy">
                    {r.statement}
                  </Text>
                ))}
              </View>
            ) : null}
            {(
              [
                [type === 'top' ? 'Why it’s top' : 'Why it needs improvement', type === 'top' ? 'trophy-outline' : 'construct-outline', () => openPost(selected, true)],
                ...(selected.isVideo ? ([['Deep video analysis', 'film-outline', () => router.push({ pathname: '/intelligence/video/[id]', params: { id: selected.post.id, accountId: selected.accountId } })]] as const) : []),
                ['Open post analysis', 'analytics-outline', () => openPost(selected)],
              ] as const
            ).map(([label, icon, action]) => (
              <Pressable
                key={label}
                onPress={() => {
                  setSelected(null);
                  action();
                }}
                accessibilityRole="button"
                className="min-h-12 flex-row items-center border-b border-neutral-100 active:bg-neutral-50"
              >
                <Ionicons name={icon} size={19} color={colors.navy} />
                <Text className="ml-md text-body text-navy">{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function TopicsList({ analysis, accountId }: { analysis: Analysis; accountId: string | null }) {
  const topics = analysis.topics.filter((t) => !accountId || t.accountId === accountId);
  const all = analysis.scope === 'all';
  const [aiOpen, setAiOpen] = useState(false);
  if (topics.length === 0) {
    return <Text className="py-md text-label font-normal text-neutral-500">No clear patterns yet. Trends appear once there is enough history with measurable differences.</Text>;
  }
  return (
    <View>
      <Text className="mb-sm text-[10px] text-neutral-400">Measured across each account’s full synced history.</Text>
      {topics.map(({ trend, platform, accountId: owner }) => (
        <View key={`${owner}_${trend.id}`} className="mb-sm rounded-xl border border-neutral-100 bg-white p-md">
          <View className="mb-xs flex-row items-center">
            {all ? <PlatformLogoTile platform={platform} size={16} /> : null}
            <Text className={`${all ? 'ml-xs' : ''} flex-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500`}>
              {trend.topic ? `“${trend.topic}”` : CATEGORY_LABEL[trend.category]}
            </Text>
            <Ionicons name={trend.direction === 'up' ? 'trending-up' : 'trending-down'} size={14} color={trend.direction === 'up' ? colors.success : colors.danger} />
          </View>
          <Text className="text-[12.5px] leading-[18px] text-navy">{trend.headline}.</Text>
          <View className="mt-xs flex-row items-center justify-between">
            <ConfidenceMeter confidence={trend.confidence} />
            <Provenance kind="measured" />
          </View>
        </View>
      ))}
      {!all && analysis.aiConfigured ? (
        aiOpen ? (
          <AiTopics accountId={analysis.scope} />
        ) : (
          <Button title="Explain these trends with AI" icon="sparkles-outline" variant="secondary" onPress={() => setAiOpen(true)} />
        )
      ) : null}
    </View>
  );
}

function AiTopics({ accountId }: { accountId: string }) {
  const fetcher = useCallback(() => fetchTrendsAi(accountId), [accountId]);
  const { state, reload } = useApiResource(fetcher);
  if (state.status === 'loading') return <Skeleton className="h-24 w-full rounded-xl" />;
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? state.code : undefined, state.message);
    return (
      <View className="rounded-xl bg-neutral-50 p-md">
        <Text className="text-label font-semibold text-navy">{copy.title}</Text>
        <Text className="mt-xs text-caption text-neutral-500">{copy.message}</Text>
        <Button title="Try again" variant="ghost" size="sm" onPress={reload} />
      </View>
    );
  }
  return (
    <View className="rounded-xl border border-violet-border bg-violet-light/40 p-md">
      <Provenance kind="ai" />
      <Text className="mt-xs text-[13px] leading-[19px] text-navy">{state.data.summary}</Text>
      {state.data.interpretations.map((i) => (
        <Text key={i.trendId} className="mt-sm text-[12px] leading-[17px] text-navy-light">
          {i.interpretation}
        </Text>
      ))}
      <Text className="mt-sm text-[10px] text-neutral-400">AI interpretation of the measured patterns above. It may be wrong; the numbers come from your data.</Text>
    </View>
  );
}

function IdeasList({ analysis, accountId }: { analysis: Analysis; accountId: string | null }) {
  const ideas = analysis.ideas.filter((i) => !accountId || i.accountId === accountId);
  if (ideas.length === 0) {
    return <Text className="py-md text-label font-normal text-neutral-500">Ideas appear once your history shows patterns worth repeating (formats, topics, timing).</Text>;
  }
  return (
    <View>
      {ideas.map((idea) => (
        <View key={idea.id} className="mb-sm rounded-xl border border-neutral-100 bg-white p-md">
          <View className="mb-xs flex-row items-center justify-between">
            <View className="flex-row items-center">
              <PlatformLogoTile platform={idea.platform} size={16} />
              <Text className="ml-xs text-[10px] font-semibold text-neutral-500">
                {platformOption(idea.platform).name}
                {idea.format ? ` · ${formatLabel(idea.format, idea.platform).singular}` : ''}
              </Text>
            </View>
            <Provenance kind="suggestion" />
          </View>
          <Text className="text-[13.5px] font-semibold leading-[19px] text-navy">{idea.idea}</Text>
          <View className="mt-sm rounded-lg bg-neutral-50 p-sm">
            <View className="mb-0.5 flex-row items-center">
              <Text className="mr-xs text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Why</Text>
              <Provenance kind="measured" />
            </View>
            <Text className="text-[11.5px] leading-[16px] text-navy-light">{idea.why}</Text>
          </View>
          {idea.when ? (
            <Text className="mt-xs text-[11px] text-neutral-500">
              <Ionicons name="time-outline" size={11} color={colors.neutral500} /> Best measured time: {idea.when}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Content analysis: Top Content, Needs Improvement, Trending Topics and Content Ideas, for the scope in
 * view. In All Platforms mode a second row narrows the content to one platform.
 */
export function ContentSection({ analysis, period }: { analysis: Analysis; period: AnalysisPeriod }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('top');
  const [filter, setFilter] = useState<string | null>(null);
  const [pickLibrary, setPickLibrary] = useState(false);
  const all = analysis.scope === 'all';
  const accounts = analysis.accounts.filter((a) => (all ? true : a.id === analysis.scope));
  const libraryAccount = all ? filter : analysis.scope;
  const openLibrary = (id: string) => router.push({ pathname: '/intelligence/library', params: { accountId: id } });

  return (
    <AnalysisCard className="px-0 pb-md">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-lg" accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <Pressable
              key={t.value}
              onPress={() => setTab(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={`mr-sm h-10 justify-center rounded-full px-lg ${active ? 'border-[1.5px] border-primary bg-sky' : 'bg-neutral-50'}`}
            >
              <Text className={`text-[13px] ${active ? 'font-semibold text-primary' : 'font-medium text-neutral-500'}`}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {all ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-md" contentContainerClassName="px-lg" accessibilityRole="tablist">
          {[null, ...accounts.map((a) => a.id)].map((id) => {
            const active = id === filter;
            const account = accounts.find((a) => a.id === id);
            return (
              <Pressable
                key={id ?? 'all'}
                onPress={() => setFilter(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`mr-sm h-9 flex-row items-center rounded-full px-md ${active ? 'bg-sky' : ''}`}
              >
                {account ? <PlatformLogoTile platform={account.platform} size={18} /> : null}
                <Text className={`${account ? 'ml-xs' : ''} text-[13px] ${active ? 'font-semibold text-primary' : 'text-navy'}`}>{account ? platformOption(account.platform).name : 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View className="mt-md px-lg">
        {tab === 'top' || tab === 'improve' ? (
          <ContentRow key={`${tab}:${filter}:${analysis.scope}:${period}`} scope={analysis.scope} period={period} type={tab} accountId={all ? filter : null} />
        ) : tab === 'topics' ? (
          <TopicsList analysis={analysis} accountId={all ? filter : null} />
        ) : (
          <IdeasList analysis={analysis} accountId={all ? filter : null} />
        )}

        {tab === 'top' || tab === 'improve' ? (
          <Pressable
            onPress={() => (libraryAccount ? openLibrary(libraryAccount) : setPickLibrary(true))}
            accessibilityRole="button"
            className="mt-md h-11 flex-row items-center justify-center rounded-xl bg-sky/70 active:bg-sky"
          >
            <Text className="text-[14px] font-semibold text-primary">View all content</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} style={{ marginLeft: 6 }} />
          </Pressable>
        ) : null}
      </View>

      <BottomSheet visible={pickLibrary} onClose={() => setPickLibrary(false)} title="View all content">
        {accounts.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => {
              setPickLibrary(false);
              openLibrary(a.id);
            }}
            accessibilityRole="button"
            className="min-h-14 flex-row items-center border-b border-neutral-100 active:bg-neutral-50"
          >
            <PlatformLogoTile platform={a.platform} size={28} />
            <View className="ml-md flex-1">
              <Text className="text-body text-navy">{platformOption(a.platform).name}</Text>
              <Text className="text-caption text-neutral-500">
                @{a.handle} · {a.contentCount.toLocaleString()} items
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.neutral400} />
          </Pressable>
        ))}
      </BottomSheet>
    </AnalysisCard>
  );
}
