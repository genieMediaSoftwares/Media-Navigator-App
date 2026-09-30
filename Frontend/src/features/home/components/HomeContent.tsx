import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Gradient } from '@/components/visual/Gradient';
import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { fetchAiInsights, fetchIntelligenceOverview, fetchMediaPage } from '@/features/intelligence/api';
import { AccountHeader } from '@/features/intelligence/components/AccountHeader';
import { EvidenceTag } from '@/features/intelligence/components/Evidence';
import { MediaRail, tileFromPost } from '@/features/intelligence/components/MediaTile';
import { FORMAT_LABELS } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { describeLeadingFormat, formatPlural, leadingFormat, typicalBadge } from '@/features/intelligence/tiers';
import { useApiResource } from '@/hooks/useApiResource';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { HomeOverview, IntelligenceOverview, SocialPlatform } from '@/types/api';

import { HeroSignalBanner } from './HeroSignalBanner';

/** What each platform calls its audience. */
const AUDIENCE: Record<SocialPlatform, string> = { instagram: 'Followers', facebook: 'Followers', youtube: 'Subscribers', linkedin: 'Followers' };
const RECENT_WINDOW = 10;
const NEW_POST_MS = 3 * 24 * 60 * 60 * 1000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The one thing worth knowing right now, measured from the account's formats. */
function WhatsHappening({ overview, onOpen }: { overview: IntelligenceOverview; onOpen: (format: string) => void }) {
  const lead = leadingFormat(overview.formats);
  if (!lead) return null;
  const { best } = lead;
  const name = FORMAT_LABELS[best.format].plural;
  return (
    <FadeIn index={1} className="mb-2xl">
      <View style={elevation.float}>
        <Gradient name="brand" style={{ borderRadius: 28, padding: 22 }}>
          <Overline icon="pulse" color={colors.onDarkMuted}>
            What’s happening
          </Overline>
          <Text className="mt-sm text-heading text-white">Your {name.toLowerCase()} get the most engagement.</Text>
          <Text className="mt-sm text-label font-normal" style={{ color: colors.onDarkMuted }}>
            {best.count} {formatPlural(best.format, best.count)} analyzed. {describeLeadingFormat(best, lead.next)}
          </Text>
          <Pressable onPress={() => onOpen(best.format)} accessibilityRole="button" className="mt-lg min-h-11 flex-row items-center self-start">
            <Text className="text-label font-bold text-white">See why</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.white} style={{ marginLeft: 6 }} />
          </Pressable>
        </Gradient>
      </View>
    </FadeIn>
  );
}

/** Two or three of the account's strongest real posts. */
function TopContent({ overview, onSeeAll }: { overview: IntelligenceOverview; onSeeAll: () => void }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const accountId = overview.account.id;
  const fetcher = useCallback(
    () => fetchMediaPage({ accountId, tier: 'top', sort: 'interactions', limit: 3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, overview.account.lastSyncedAt],
  );
  const { state } = useApiResource(fetcher);
  if (!overview.tiers.sufficient) return null;
  const posts = state.status === 'success' ? state.data.items : [];

  return (
    <FadeIn index={2} className="mb-2xl">
      <SectionTitle title="Top content" description="Your strongest posts, measured against your typical post." action={{ label: 'All', onPress: onSeeAll }} />
      {state.status === 'loading' ? (
        <Skeleton className="h-72 w-full rounded-3xl" />
      ) : posts.length === 0 ? (
        <Text className="text-label font-normal text-neutral-500">No post has reached twice your typical interactions yet.</Text>
      ) : (
        <MediaRail
          items={posts.map(tileFromPost)}
          width={Math.min(width * 0.7, 300)}
          aspect={1.2}
          cta="Why did this work?"
          badgeFor={(item) => {
            const post = posts.find((p) => p.id === item.id);
            return post ? typicalBadge(post) : null;
          }}
          onPress={(item) => router.push({ pathname: '/intelligence/post/[id]', params: { id: item.id, accountId, analyze: '1' } })}
        />
      )}
    </FadeIn>
  );
}

/** One AI recommendation, clearly labelled, with the way to all of them. */
function WhatToDoNext({ overview, onOpen }: { overview: IntelligenceOverview; onOpen: () => void }) {
  const accountId = overview.account.id;
  const fetcher = useCallback(
    async () => intelligenceSession.insights(accountId) ?? fetchAiInsights(accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, overview.account.lastSyncedAt],
  );
  const { state } = useApiResource(fetcher);
  useEffect(() => {
    if (state.status === 'success') intelligenceSession.setInsights(accountId, state.data);
  }, [state, accountId]);
  if (!overview.aiConfigured || !overview.tiers.sufficient) return null;
  if (state.status === 'loading') return <Skeleton className="mb-2xl h-32 w-full rounded-2xl" />;
  if (state.status !== 'success') return null;
  const insight = state.data.insights.find((i) => i.recommendation) ?? null;
  if (!insight) return null;

  return (
    <FadeIn index={3} className="mb-2xl">
      <SectionTitle title="What to do next" />
      <View className="rounded-2xl bg-violet-light p-lg">
        <EvidenceTag kind="aiSuggestion" />
        <Text className="mt-sm text-body text-navy">{insight.recommendation}</Text>
        <Pressable onPress={onOpen} accessibilityRole="button" className="mt-sm min-h-11 justify-center self-start">
          <Text className="text-label font-semibold text-violet">View recommendations ›</Text>
        </Pressable>
      </View>
    </FadeIn>
  );
}

/** Latest 10 posts vs the 10 before them, by typical (median) interactions. */
function RecentPerformance({ overview }: { overview: IntelligenceOverview }) {
  const accountId = overview.account.id;
  const fetcher = useCallback(
    () => fetchMediaPage({ accountId, sort: 'recent', limit: RECENT_WINDOW * 2 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, overview.account.lastSyncedAt],
  );
  const { state } = useApiResource(fetcher);
  // Captured once: render must not read the clock.
  const [now] = useState(() => Date.now());
  if (state.status !== 'success') return null;
  const items = state.data.items.filter((p) => p.interactions !== null);
  if (items.length < RECENT_WINDOW * 2) return null;
  const latest = items.slice(0, RECENT_WINDOW);
  const latestTypical = median(latest.map((p) => p.interactions as number));
  const previousTypical = median(items.slice(RECENT_WINDOW, RECENT_WINDOW * 2).map((p) => p.interactions as number));
  const stillCollecting = latest.some((p) => p.publishedAt !== null && now - Date.parse(p.publishedAt) < NEW_POST_MS);
  const up = latestTypical > previousTypical * 1.1;
  const down = latestTypical < previousTypical * 0.9;

  return (
    <FadeIn index={4} className="mb-2xl">
      <View className="mb-md flex-row flex-wrap items-center justify-between">
        <Text className="mr-sm text-heading text-navy" accessibilityRole="header">
          Recent performance
        </Text>
        <EvidenceTag kind="observed" />
      </View>
      <Text className="mb-md text-body text-navy">
        {up
          ? 'Your latest posts are getting more interactions than the ones before.'
          : down
            ? 'Your latest posts are getting fewer interactions than the ones before.'
            : 'Your latest posts are performing about the same as the ones before.'}
      </Text>
      <MetricStrip
        metrics={[
          { label: `Typical · latest ${RECENT_WINDOW}`, value: formatCompactNumber(latestTypical), accent: up ? colors.success : down ? colors.warning : undefined },
          { label: `Typical · previous ${RECENT_WINDOW}`, value: formatCompactNumber(previousTypical) },
        ]}
      />
      {stillCollecting ? <Text className="mt-sm text-caption text-neutral-400">Posts from the last 3 days are still collecting interactions.</Text> : null}
    </FadeIn>
  );
}

/** Home: what is happening with this account, in a few real numbers and one next step. */
export function HomeContent({ overview }: { overview: HomeOverview }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(overview.channels[0]?.accountId ?? null);
  const fetcher = useCallback(() => fetchIntelligenceOverview(accountId), [accountId]);
  const intelligence = useApiResource(fetcher);
  const data = intelligence.state.status === 'success' ? intelligence.state.data : null;
  const intel = data?.overview ?? null;
  const channel = overview.channels.find((c) => c.accountId === (intel?.account.id ?? accountId)) ?? overview.channels[0] ?? null;

  useEffect(() => {
    if (intel) intelligenceSession.setOverview(intel);
  }, [intel]);

  const openIntelligence = () =>
    intel && intel.account.platform !== 'instagram' ? router.navigate({ pathname: '/intelligence', params: { accountId: intel.account.id } }) : router.navigate('/intelligence');

  return (
    <View>
      {overview.heroSignal ? <HeroSignalBanner signal={overview.heroSignal} /> : null}

      {intelligence.state.status === 'loading' ? (
        <View>
          <Skeleton className="mb-xl h-12 w-2/3" />
          <Skeleton className="mb-2xl h-14 w-full" />
          <Skeleton className="h-44 w-full rounded-3xl" />
        </View>
      ) : !intel || !data ? (
        <ErrorState message={intelligence.state.status === 'error' || intelligence.state.status === 'unavailable' ? intelligence.state.message : 'No account data yet.'} onRetry={intelligence.reload} />
      ) : (
        <>
          <FadeIn>
            <AccountHeader account={intel.account} accounts={data.accounts} syncedPosts={intel.archive.syncedCount} onSelect={setAccountId} />
            <View className="mb-2xl">
              <MetricStrip
                metrics={[
                  { label: AUDIENCE[intel.account.platform], value: intel.summary.followers === null ? null : formatCompactNumber(intel.summary.followers) },
                  { label: 'Posts analyzed', value: intel.archive.syncedCount.toLocaleString() },
                  { label: 'Recent engagement', value: channel?.engagementRate == null ? null : formatPercent(channel.engagementRate, 2) },
                ]}
              />
              <Text className="mt-sm text-center text-caption text-neutral-400">Recent engagement: your latest 50 posts.</Text>
            </View>
          </FadeIn>

          <WhatsHappening overview={intel} onOpen={(format) => router.push({ pathname: '/intelligence/formats', params: { accountId: intel.account.id, format } })} />
          <TopContent overview={intel} onSeeAll={openIntelligence} />
          <WhatToDoNext overview={intel} onOpen={() => router.push({ pathname: '/intelligence/trends', params: { accountId: intel.account.id } })} />
          <RecentPerformance overview={intel} />
        </>
      )}

      <Pressable onPress={() => router.push('/connected-accounts')} accessibilityRole="button" className="min-h-11 flex-row items-center justify-center">
        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
        <Text className="ml-xs text-label font-semibold text-primary">Manage connected accounts</Text>
      </Pressable>
    </View>
  );
}
