import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { ComponentProps, useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Gradient } from '@/components/visual/Gradient';
import { PerformanceBar } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { ComparisonView } from '@/features/analysis/components/ComparisonView';
import { MetricCell, num, ScoreBadge } from '@/features/analysis/components/Primitives';
import { ReasonsPanel } from '@/features/analysis/components/ReasonsPanel';
import { VideoAnalysisView } from '@/features/analysis/components/VideoAnalysisView';
import { fetchPostDetail } from '@/features/intelligence/api';
import { EvidenceTag } from '@/features/intelligence/components/Evidence';
import { MediaThumb } from '@/features/intelligence/components/MediaThumb';
import { PostAnalysisSection } from '@/features/intelligence/components/PostAnalysisSection';
import { formatLabel } from '@/features/intelligence/labels';
import { formatVsTypical, toneOf } from '@/features/intelligence/tiers';
import { useApiResource } from '@/hooks/useApiResource';
import { formatCompactNumber, formatDate, formatPercent, NOT_AVAILABLE } from '@/lib/format';
import { PostDetail } from '@/types/api';

type IconName = ComponentProps<typeof Ionicons>['name'];
type DetailTab = 'overview' | 'compare' | 'analysis' | 'video';

const FACT_ICONS: Record<string, IconName> = {
  Format: 'layers-outline',
  Published: 'calendar-outline',
  'Caption length': 'text-outline',
  Hashtags: 'pricetag-outline',
  Mentions: 'at-outline',
  Timing: 'time-outline',
};

function Caption({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [truncatable, setTruncatable] = useState(false);
  if (!text) return <Text className="text-body text-neutral-500">No caption</Text>;
  return (
    <View>
      <Text
        className="text-body text-navy"
        numberOfLines={expanded ? undefined : 3}
        onTextLayout={(e) => {
          if (!expanded && e.nativeEvent.lines.length >= 3) setTruncatable(true);
        }}
      >
        {text}
      </Text>
      {truncatable ? (
        <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button" className="min-h-11 justify-center self-start">
          <Text className="text-label font-semibold text-primary">{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PostDetailContent({ detail, accountId, autoAnalyze }: { detail: PostDetail; accountId: string | null; autoAnalyze: boolean }) {
  const { width } = useWindowDimensions();
  const { post, comparison } = detail;
  const m = post.metrics;
  const format = formatLabel(post.format, detail.account.platform);
  const heroHeight = Math.min(width * 1.0, 440);
  const typical = comparison.typicalInteractions ?? null;
  const barMax = Math.max(post.interactions ?? 0, typical ?? 0, comparison.formatAvgInteractions ?? 0);
  const vsTypical = formatVsTypical(comparison.vsTypicalPercent);
  const tone = toneOf(comparison.vsTypicalPercent);
  const analysis = detail.analysis ?? null;
  const tabs: Array<{ value: DetailTab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'compare', label: 'Compare' },
    { value: 'analysis', label: 'Analysis' },
    ...(analysis?.isVideo ? [{ value: 'video' as const, label: 'Video' }] : []),
  ];
  // "Why did this work?" links open straight on the analysis.
  const [tab, setTab] = useState<DetailTab>(autoAnalyze ? 'analysis' : 'overview');
  const platform = platformOption(detail.account.platform);
  const openInstagram = post.permalink ? () => void Linking.openURL(post.permalink as string) : undefined;

  return (
    <>
      {/* Media hero, edge to edge */}
      <View style={{ width, height: heroHeight }}>
        <MediaThumb uri={post.previewUrl} format={post.format} rounded="none" />
        <Gradient name="scrim" direction="vertical" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: heroHeight * 0.45, justifyContent: 'flex-end', padding: 20, paddingBottom: 44 }}>
          <View className="flex-row items-end">
            <View className="flex-1">
              <View className="mb-xs flex-row items-center self-start rounded-full px-md py-1" style={{ backgroundColor: format.color }}>
                <Ionicons name={format.icon} size={13} color={colors.white} />
                <Text className="ml-1 text-overline uppercase text-white">{format.singular}</Text>
              </View>
              <Text className="text-label font-semibold text-white">{platform.name}{post.publishedAt ? ` · ${formatDate(post.publishedAt)}` : ''}</Text>
            </View>
            {openInstagram ? (
              <Pressable
                onPress={openInstagram}
                accessibilityRole="link"
                accessibilityLabel={`Open on ${platform.name}`}
                className="h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.onDarkSubtle }}
              >
                <Ionicons name="open-outline" size={20} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        </Gradient>
      </View>

      {/* Content sheet slides over the media */}
      <View className="-mt-6 rounded-t-3xl bg-white px-xl pt-xl">
        <Caption text={post.caption} />

        <View className="my-xl">
          <SegmentedControl segments={tabs} value={tab} onChange={setTab} />
        </View>

        {tab === 'overview' ? (
          <FadeIn>
            <View className="mb-lg flex-row items-center justify-between">
              <View className="flex-1 pr-md">
                <Overline icon="pulse" color={colors.primaryBright}>
                  Performance overview
                </Overline>
                {analysis?.kind ? (
                  <Text className="mt-xs text-label font-normal text-neutral-500">
                    {analysis.kind === 'top' ? 'Scores at or above your typical post.' : 'Scores below your typical post.'}
                  </Text>
                ) : null}
              </View>
              {analysis ? <ScoreBadge score={analysis.score} size="lg" /> : null}
            </View>
            <View className="flex-row flex-wrap">
              <MetricCell label="Views" value={num(m.views)} />
              <MetricCell label="Likes" value={num(m.likes)} />
              <MetricCell label="Comments" value={num(m.comments)} />
              <MetricCell label="Shares" value={num(m.shares)} />
              <MetricCell label="Saves" value={num(m.saves)} />
              <MetricCell label="Engagement rate" value={post.engagementRate === null ? null : formatPercent(post.engagementRate, 2)} />
              {m.reach !== null ? <MetricCell label="Reach" value={num(m.reach)} /> : null}
              {analysis?.avgWatchTimeMs != null ? <MetricCell label="Avg watch time" value={`${(analysis.avgWatchTimeMs / 1000).toFixed(1)}s`} /> : null}
            </View>
            {vsTypical ? (
              <Text className={`mb-lg text-label font-semibold ${tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-warning' : 'text-navy'}`}>Interactions: {vsTypical === 'About typical' ? 'about the same as' : vsTypical.replace(' typical', '')} your typical post</Text>
            ) : null}

            <View className="mb-md mt-sm flex-row flex-wrap items-center justify-between">
              <Text className="mr-sm text-title text-navy" accessibilityRole="header">
                About this post
              </Text>
              <EvidenceTag kind="observed" />
            </View>
            {detail.observedFactors.map((fact) => (
              <View key={fact.label} className="flex-row items-center py-sm" accessible accessibilityLabel={`${fact.label}: ${fact.value}`}>
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-success-light">
                  <Ionicons name={FACT_ICONS[fact.label] ?? 'ellipse-outline'} size={16} color={colors.success} />
                </View>
                <Text className="ml-md text-label font-normal text-neutral-500">{fact.label}</Text>
                <Text className="ml-md flex-1 text-right text-label font-semibold text-navy">{fact.value}</Text>
              </View>
            ))}
            {analysis ? <Text className="mt-lg text-caption text-neutral-400">{analysis.scoreDefinition}</Text> : null}
          </FadeIn>
        ) : null}

        {tab === 'compare' ? (
          <FadeIn>
            {analysis ? (
              <ComparisonView post={post} comparisons={analysis.comparisons} score={analysis.score} platform={detail.account.platform} />
            ) : post.interactions === null || typical === null ? (
              <Text className="text-body text-neutral-500">Not enough data to compare this post.</Text>
            ) : (
              <>
                <PerformanceBar label="This post" value={formatCompactNumber(post.interactions)} ratio={barMax > 0 ? post.interactions / barMax : 0} color={colors.primaryBright} emphasis />
                <PerformanceBar label="Your typical post" value={formatCompactNumber(typical)} ratio={barMax > 0 ? typical / barMax : 0} color={colors.neutral300} />
              </>
            )}
          </FadeIn>
        ) : null}

        {tab === 'analysis' ? (
          <FadeIn className="mb-xl">
            {analysis?.kind ? (
              <>
                <Text className="mb-lg text-heading text-navy" accessibilityRole="header">
                  {analysis.kind === 'top' ? 'Why it’s top' : 'Why it needs improvement'}
                </Text>
                <ReasonsPanel
                  accountId={accountId}
                  postId={post.id}
                  kind={analysis.kind}
                  reasons={analysis.reasons}
                  improvements={analysis.improvements}
                  aiConfigured={detail.aiConfigured}
                  autoStartAi={autoAnalyze}
                />
              </>
            ) : (
              <PostAnalysisSection
                accountId={accountId}
                postId={post.id}
                tier={detail.classification === 'insufficient' ? null : (post.tier ?? null)}
                postFormat={post.format}
                aiConfigured={detail.aiConfigured}
                autoStart={autoAnalyze}
              />
            )}
          </FadeIn>
        ) : null}

        {tab === 'video' ? (
          <FadeIn className="mb-xl">
            <VideoAnalysisView accountId={accountId} postId={post.id} />
          </FadeIn>
        ) : null}

        {openInstagram ? <Button title={`Open on ${platform.name}`} icon={platform.icon} variant="secondary" onPress={openInstagram} /> : null}
        <Text className="mt-md text-center text-caption text-neutral-400">{NOT_AVAILABLE} means {platform.name} did not provide that metric for this post. It is never shown as zero.</Text>
      </View>
    </>
  );
}

/** Reusable post performance screen: media first, measured data, then AI interpretation. */
export default function PostDetailScreen() {
  const { id, accountId, analyze } = useLocalSearchParams<{ id: string; accountId?: string; analyze?: string }>();
  const account = accountId || null;
  const fetcher = useCallback(() => fetchPostDetail(account, id), [account, id]);
  const { state, reload, refresh, refreshing } = useApiResource(fetcher);

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="pb-3xl"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {state.status === 'loading' ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading post">
          <Skeleton className="h-96 w-full rounded-none" />
          <View className="px-xl pt-xl">
            <Skeleton className="mb-sm h-4 w-full" />
            <Skeleton className="mb-xl h-4 w-2/3" />
            <Skeleton className="mb-md h-12 w-32" />
            <Skeleton className="h-10 w-full" />
          </View>
        </View>
      ) : state.status === 'success' ? (
        <PostDetailContent detail={state.data} accountId={account} autoAnalyze={analyze === '1'} />
      ) : (
        <View className="p-xl">
          <ErrorState message={state.message} onRetry={reload} />
        </View>
      )}
    </ScrollView>
  );
}
