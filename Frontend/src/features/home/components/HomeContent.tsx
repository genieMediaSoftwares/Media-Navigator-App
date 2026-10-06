import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { FadeIn } from '@/components/visual/Motion';
import { colors } from '@/constants/colors';
import { accountHref, platformOption } from '@/features/accounts/platforms';
import { fetchDashboard } from '@/features/analysis/api';
import { PostingWindowCard } from '@/features/analysis/components/PostingWindowCard';
import { LinkButton, MetricCell, num, pctOrNull, ScoreBadge, SectionLabel } from '@/features/analysis/components/Primitives';
import { SyncBar } from '@/features/analysis/components/SyncBar';
import { TaskList } from '@/features/analysis/components/TaskList';
import { TrendChart } from '@/features/analysis/components/TrendChart';
import { AccountHeader } from '@/features/intelligence/components/AccountHeader';
import { MediaThumb } from '@/features/intelligence/components/MediaThumb';
import { formatLabel } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { formatDate } from '@/lib/format';
import { Dashboard, MetricTotal } from '@/types/analysis';
import { HomeOverview } from '@/types/api';

import { HeroSignalBanner } from './HeroSignalBanner';

/** "1,240 of 1,300 posts" when a metric is missing for some posts, so totals are never overstated. */
function coverage(metric: MetricTotal, total: number): string | undefined {
  return metric.postsWithData > 0 && metric.postsWithData < total ? `${metric.postsWithData.toLocaleString()} of ${total.toLocaleString()} posts` : undefined;
}

function DashboardSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading dashboard">
      <Skeleton className="mb-xl h-14 w-full rounded-xl" />
      <View className="mb-xl flex-row flex-wrap">
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} className="mb-lg w-1/2 pr-md">
            <Skeleton className="mb-xs h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </View>
        ))}
      </View>
      <Skeleton className="h-28 w-full rounded-xl" />
    </View>
  );
}

function BestPost({ dashboard, onOpen }: { dashboard: Dashboard; onOpen: (id: string) => void }) {
  const best = dashboard.summary.bestPost;
  if (!best) return null;
  const format = formatLabel(best.format, dashboard.account.platform);
  return (
    <Pressable
      onPress={() => onOpen(best.id)}
      accessibilityRole="button"
      accessibilityLabel={`Best performing content: ${format.singular}${best.publishedAt ? ` from ${formatDate(best.publishedAt)}` : ''}, score ${best.score}`}
      className="flex-row items-center rounded-xl border border-neutral-100 p-md active:bg-neutral-50"
    >
      <MediaThumb uri={best.previewUrl} format={best.format} size={72} rounded="lg" />
      <View className="mx-md flex-1">
        <Text className="text-caption text-neutral-500">
          {format.singular}
          {best.publishedAt ? ` · ${formatDate(best.publishedAt)}` : ''}
        </Text>
        <Text className="mt-0.5 text-label text-navy" numberOfLines={2}>
          {best.caption ?? 'No caption'}
        </Text>
        <Text className="mt-xs text-caption text-neutral-500">
          {[best.metrics.views !== null ? `${num(best.metrics.views)} views` : null, best.metrics.likes !== null ? `${num(best.metrics.likes)} likes` : null, best.engagementRate !== null ? `${pctOrNull(best.engagementRate)} eng.` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <ScoreBadge score={best.score} size="sm" />
    </Pressable>
  );
}

function DashboardBody({ dashboard, accounts, onSelectAccount, onReload }: { dashboard: Dashboard; accounts: Parameters<typeof AccountHeader>[0]['accounts']; onSelectAccount: (id: string) => void; onReload: () => void }) {
  const router = useRouter();
  const s = dashboard.summary;
  const accountId = dashboard.account.id;
  const platform = platformOption(dashboard.account.platform);
  const openPost = (id: string) => router.push({ pathname: '/intelligence/post/[id]', params: { id, accountId } });
  const openAnalysis = (section: 'top' | 'improve' | 'trends') => router.navigate({ pathname: '/intelligence', params: { accountId, section } });

  return (
    <View>
      <AccountHeader account={dashboard.account} accounts={accounts} syncedPosts={s.totalPosts} onSelect={onSelectAccount} hideSyncTime />
      <SyncBar
        accountId={accountId}
        platformName={platform.name}
        sync={dashboard.sync}
        onSynced={() => {
          intelligenceSession.clearAccount(accountId);
          onReload();
        }}
        onReconnect={() => router.push(accountHref(platform.id))}
      />

      {s.totalPosts === 0 ? null : (
        <>
          {/* 1. Overview */}
          <FadeIn className="mb-xl">
            <SectionLabel>Overview</SectionLabel>
            <View className="flex-row flex-wrap">
              <MetricCell label="Total posts" value={s.totalPosts.toLocaleString()} />
              <MetricCell label="Total views" value={num(s.views.total)} hint={coverage(s.views, s.totalPosts)} />
              <MetricCell label="Total likes" value={num(s.likes.total)} hint={coverage(s.likes, s.totalPosts)} />
              <MetricCell label="Total comments" value={num(s.comments.total)} hint={coverage(s.comments, s.totalPosts)} />
              <MetricCell label="Engagement rate" value={pctOrNull(s.engagementRate.average)} hint={s.engagementRate.average !== null ? 'avg per post · of followers' : undefined} />
              <MetricCell label="Avg views / post" value={num(s.views.average)} hint={s.views.median !== null ? `typical ${num(s.views.median)}` : undefined} />
              <MetricCell label="Avg likes / post" value={num(s.likes.average)} hint={s.likes.median !== null ? `typical ${num(s.likes.median)}` : undefined} />
              <MetricCell label={platform.id === 'youtube' ? 'Subscribers' : 'Followers'} value={num(dashboard.followers)} />
            </View>
            <Text className="mb-sm text-caption font-semibold text-neutral-500">Best performing content</Text>
            <BestPost dashboard={dashboard} onOpen={openPost} />
          </FadeIn>

          {/* 2. Insight → action */}
          <FadeIn index={1} className="mb-2xl">
            <SectionLabel right={<LinkButton label="All trends" onPress={() => openAnalysis('trends')} />}>What to do next</SectionLabel>
            <TaskList tasks={dashboard.tasks} compact />
          </FadeIn>

          {/* 3. Visual analytics */}
          <FadeIn index={2} className="mb-2xl">
            <SectionLabel>Performance over time</SectionLabel>
            <TrendChart points={dashboard.trend.points} granularity={dashboard.trend.granularity} />
          </FadeIn>

          <FadeIn index={3} className="mb-2xl">
            <SectionLabel right={<LinkButton label="Heat maps" onPress={() => router.navigate({ pathname: '/planner', params: { accountId } })} />}>When to post</SectionLabel>
            <PostingWindowCard recommendation={dashboard.recommendation} showWhy={false} />
          </FadeIn>

          <FadeIn index={4} className="mb-xl">
            <SectionLabel>Explore</SectionLabel>
            <View className="flex-row">
              {(
                [
                  ['trophy-outline', 'Top performers', 'top'],
                  ['construct-outline', 'Needs improvement', 'improve'],
                  ['sparkles-outline', 'AI trends', 'trends'],
                ] as const
              ).map(([icon, label, section]) => (
                <Pressable
                  key={section}
                  onPress={() => openAnalysis(section)}
                  accessibilityRole="button"
                  className="mr-sm flex-1 items-center rounded-xl bg-neutral-50 py-lg active:bg-neutral-100"
                >
                  <Ionicons name={icon} size={20} color={section === 'trends' ? colors.violet : colors.navy} />
                  <Text className="mt-xs text-center text-caption font-semibold text-navy">{label}</Text>
                </Pressable>
              ))}
            </View>
          </FadeIn>
        </>
      )}
    </View>
  );
}

/**
 * Home dashboard: Overview → Insight → (detail lives in Analysis). Every number comes from
 * GET /api/intelligence/dashboard, computed over all synced posts.
 */
export function HomeContent({ overview }: { overview: HomeOverview }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(overview.channels[0]?.accountId ?? null);
  const fetcher = useCallback(() => fetchDashboard(accountId), [accountId]);
  const { state, reload } = useApiResource(fetcher);

  return (
    <View>
      {overview.heroSignal ? <HeroSignalBanner signal={overview.heroSignal} /> : null}
      {state.status === 'loading' ? (
        <DashboardSkeleton />
      ) : state.status !== 'success' ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : !state.data.dashboard ? (
        <ErrorState message="No account data yet." onRetry={reload} />
      ) : (
        <DashboardBody dashboard={state.data.dashboard} accounts={state.data.accounts} onSelectAccount={setAccountId} onReload={reload} />
      )}

      <Pressable onPress={() => router.push('/connected-accounts')} accessibilityRole="button" className="min-h-11 flex-row items-center justify-center">
        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
        <Text className="ml-xs text-label font-semibold text-primary">Manage connected accounts</Text>
      </Pressable>
    </View>
  );
}
