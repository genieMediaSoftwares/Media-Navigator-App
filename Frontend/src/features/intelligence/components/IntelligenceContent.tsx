import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { FadeIn } from '@/components/visual/Motion';
import { SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { accountHref, platformOption } from '@/features/accounts/platforms';
import { useApiResource } from '@/hooks/useApiResource';
import { IntelligenceAccount, IntelligenceOverview } from '@/types/api';

import { fetchMediaPage } from '../api';
import { intelligenceSession } from '../session';
import { AccountHeader } from './AccountHeader';
import { AiInsightsSection } from './AiInsightsSection';
import { FormatComparison, FormatMix } from './FormatComparison';
import { MediaRail, tileFromPost } from './MediaTile';
import { ArchiveSection, AskBand, TimingSection } from './MiscSections';
import { NeedsAttention } from './NeedsAttention';
import { PerformanceHero } from './PerformanceHero';

interface IntelligenceContentProps {
  overview: IntelligenceOverview;
  accounts: IntelligenceAccount[];
  onSelectAccount: (accountId: string) => void;
  onSync: () => void;
  syncing: boolean;
  onExplain: () => void;
}

const RECENT_COUNT = 12;

/**
 * Intelligence home as an editorial story: performance → what AI found → what's working → what
 * needs attention → recent media → formats → timing → ask → archive. Everything else is a drill-down.
 */
export function IntelligenceContent({ overview, accounts, onSelectAccount, onSync, syncing, onExplain }: IntelligenceContentProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const accountId = overview.account.id;
  const version = overview.account.lastSyncedAt;
  const platformName = platformOption(overview.account.platform).name;

  // Real recent posts power the hero chart, the recent rail and the archive mosaic.
  const recentFetcher = useCallback(
    () => fetchMediaPage({ accountId, sort: 'recent', limit: RECENT_COUNT }),
    [accountId, version], // version: refetch after a sync
  );
  const { state: recentState } = useApiResource(recentFetcher);
  const recent = recentState.status === 'success' ? recentState.data.items : null;

  useEffect(() => {
    intelligenceSession.setOverview(overview);
  }, [overview]);

  const openPost = (id: string, analyze: boolean) =>
    router.push({ pathname: '/intelligence/post/[id]', params: { id, accountId, ...(analyze && { analyze: '1' }) } });
  const openLibrary = (params: Record<string, string> = {}) => router.push({ pathname: '/intelligence/library', params: { accountId, ...params } });
  const openFormats = () => router.push({ pathname: '/intelligence/formats', params: { accountId } });

  const featureWidth = Math.min(width * 0.64, 300);
  const analyzed = overview.baseline.sampleSize;

  return (
    <View>
      <AccountHeader account={overview.account} accounts={accounts} syncedPosts={overview.archive.syncedCount} onSelect={onSelectAccount} />

      {overview.account.status !== 'connected' ? (
        <View className="mb-xl flex-row items-center rounded-2xl bg-warning-light p-lg" accessibilityRole="alert">
          <View className="flex-1">
            <Text className="text-label font-semibold text-navy">{platformName} needs to be reconnected</Text>
            <Text className="mt-xs text-caption text-neutral-500">You’re seeing your last synced data.</Text>
          </View>
          <Pressable onPress={() => router.push(accountHref(overview.account.platform))} accessibilityRole="button" className="min-h-11 justify-center rounded-full bg-white px-lg">
            <Text className="text-label font-bold text-warning">Reconnect</Text>
          </Pressable>
        </View>
      ) : null}

      {overview.archive.syncedCount === 0 ? (
        <EmptyState
          icon="cloud-download-outline"
          title={`No ${platformName} content has been synchronized yet`}
          message={`Sync your account to bring in your posts and their real metrics from ${platformName}.`}
          action={syncing ? undefined : { label: 'Sync now', onPress: onSync }}
        />
      ) : (
        <>
          <FadeIn index={0}>
            <PerformanceHero overview={overview} recent={recent} onExplain={onExplain} />
          </FadeIn>

          <FadeIn index={1}>
            <AiInsightsSection
              accountId={accountId}
              aiConfigured={overview.aiConfigured}
              rankingSufficient={overview.ranking.sufficient}
              minimumPosts={overview.ranking.minimumRequired}
              analyzedPosts={analyzed}
              version={version}
            />
          </FadeIn>

          <FadeIn index={2} className="mb-2xl">
            <SectionTitle
              eyebrow="What’s working"
              eyebrowIcon="trending-up"
              eyebrowColor={colors.success}
              title="Your top content"
              description="Ranked by real interactions against your account average."
              action={overview.ranking.working.length > 0 ? { label: 'All', onPress: () => openLibrary({ sort: 'interactions', performance: 'above' }) } : undefined}
            />
            {!overview.ranking.sufficient ? (
              <Text className="text-label font-normal text-neutral-500">
                More content history needed — rankings appear at {overview.ranking.minimumRequired} posts with engagement data ({analyzed} so far).
              </Text>
            ) : overview.ranking.working.length === 0 ? (
              <Text className="text-label font-normal text-neutral-500">No post is above your account average yet.</Text>
            ) : (
              <MediaRail
                items={overview.ranking.working.map(tileFromPost)}
                width={featureWidth}
                aspect={1.25}
                showDelta
                cta="Why it worked"
                onPress={(item) => openPost(item.id, true)}
              />
            )}
          </FadeIn>

          <FadeIn index={3}>
            <NeedsAttention
              posts={overview.ranking.attention}
              baseline={overview.baseline.avgInteractions}
              median={overview.baseline.medianInteractions}
              sufficient={overview.ranking.sufficient}
              onOpen={(post) => openPost(post.id, true)}
              onSeeAll={() => openLibrary({ performance: 'below' })}
            />
          </FadeIn>

          <FadeIn index={4} className="mb-2xl">
            <SectionTitle eyebrow="Recent content" eyebrowIcon="images-outline" title="Latest posts" action={{ label: 'Library', onPress: () => openLibrary() }} />
            {recent ? (
              <MediaRail items={recent.map(tileFromPost)} width={132} aspect={1.25} showDate onPress={(item) => openPost(item.id, false)} />
            ) : recentState.status === 'loading' ? (
              <View className="flex-row gap-md">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-40 w-32 rounded-2xl" />
                ))}
              </View>
            ) : (
              <Text className="text-label font-normal text-neutral-500">Recent posts couldn’t be loaded. Pull to refresh.</Text>
            )}
          </FadeIn>

          {overview.formats.length > 0 ? (
            <FadeIn index={5} className="mb-2xl">
              <SectionTitle eyebrow="Format patterns" eyebrowIcon="layers-outline" eyebrowColor={colors.magenta} title="What format wins" action={{ label: 'Details', onPress: openFormats }} />
              <FormatMix counts={overview.archive.formatCounts} />
              <View className="mt-md">
                <FormatComparison formats={overview.formats} onPressFormat={openFormats} />
              </View>
            </FadeIn>
          ) : null}

          <FadeIn index={6}>
            <TimingSection timing={overview.timing} onOpenPlanner={() => router.navigate('/planner')} />
          </FadeIn>

          <AskBand
            aiConfigured={overview.aiConfigured}
            onAsk={(question) => router.push({ pathname: '/intelligence/ask', params: { accountId, ...(question && { q: question }) } })}
            platformName={platformName}
          />

          <ArchiveSection archive={overview.archive} recent={recent} onOpen={() => openLibrary()} platformName={platformName} />

          {overview.lastSyncRun?.status === 'failed' ? (
            <Text className="mb-sm text-center text-caption text-danger">Last sync failed: {overview.lastSyncRun.errorMessage ?? 'Unknown error'}</Text>
          ) : null}
          <Button title={syncing ? 'Syncing…' : 'Sync now'} icon="refresh-outline" variant="ghost" size="sm" loading={syncing} onPress={onSync} />
        </>
      )}
    </View>
  );
}
