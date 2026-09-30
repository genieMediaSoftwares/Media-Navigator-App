import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { ComponentProps, useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Gradient } from '@/components/visual/Gradient';
import { MetricStrip, PerformanceBar } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { fetchPostDetail } from '@/features/intelligence/api';
import { EvidenceTag } from '@/features/intelligence/components/Evidence';
import { MediaThumb } from '@/features/intelligence/components/MediaThumb';
import { PostAnalysisSection } from '@/features/intelligence/components/PostAnalysisSection';
import { FORMAT_LABELS } from '@/features/intelligence/labels';
import { useApiResource } from '@/hooks/useApiResource';
import { describeVsAverage, formatCompactNumber, formatDate, formatPercent, NOT_AVAILABLE } from '@/lib/format';
import { PostDetail } from '@/types/api';

type IconName = ComponentProps<typeof Ionicons>['name'];

const FACT_ICONS: Record<string, IconName> = {
  Format: 'layers-outline',
  Published: 'calendar-outline',
  'Caption length': 'text-outline',
  Hashtags: 'pricetag-outline',
  Mentions: 'at-outline',
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
  const format = FORMAT_LABELS[post.format];
  const heroHeight = Math.min(width * 1.15, 520);
  const num = (value: number | null) => (value === null ? null : formatCompactNumber(value));
  const barMax = Math.max(post.interactions ?? 0, comparison.accountAvgInteractions ?? 0, comparison.formatAvgInteractions ?? 0);
  const delta = comparison.vsAccountPercent;
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

        <FadeIn className="mt-xl">
          <Overline icon="pulse" color={colors.primaryBright}>
            Performance
          </Overline>
          <View className="mt-sm flex-row items-end" accessible>
            <Text className="text-hero text-navy">{post.interactions === null ? '—' : formatCompactNumber(post.interactions)}</Text>
            <View className="mb-sm ml-md">
              <Text className="text-label font-normal text-neutral-500">interactions</Text>
              {delta !== null ? (
                <Text className={`text-label font-bold ${delta >= 0 ? 'text-success' : 'text-warning'}`}>
                  {delta >= 0 ? '▲' : '▼'} {describeVsAverage(delta)}
                </Text>
              ) : null}
            </View>
          </View>
          <View className="mt-lg">
            <MetricStrip
              metrics={[
                { label: 'Views', value: num(m.views) },
                { label: 'Likes', value: num(m.likes), accent: colors.magenta },
                { label: 'Comments', value: num(m.comments) },
              ]}
            />
          </View>
          <View className="mt-lg">
            <MetricStrip
              metrics={[
                { label: 'Shares', value: num(m.shares) },
                { label: 'Saves', value: num(m.saves) },
                { label: 'Reach', value: num(m.reach) },
                { label: 'Engagement', value: post.engagementRate === null ? null : formatPercent(post.engagementRate, 2), accent: colors.violet },
              ]}
            />
          </View>
        </FadeIn>

        <FadeIn index={1} className="mt-2xl">
          <View className="mb-md flex-row flex-wrap items-center justify-between">
            <Text className="mr-sm text-heading text-navy" accessibilityRole="header">
              vs your account
            </Text>
            <EvidenceTag kind="observed" />
          </View>
          {post.interactions === null || comparison.accountAvgInteractions === null ? (
            <Text className="text-body text-neutral-500">Not enough data to compare this post.</Text>
          ) : (
            <>
              <PerformanceBar label="This post" value={formatCompactNumber(post.interactions)} ratio={barMax > 0 ? post.interactions / barMax : 0} color={colors.primaryBright} emphasis />
              <PerformanceBar
                label="Account average"
                value={formatCompactNumber(comparison.accountAvgInteractions)}
                ratio={barMax > 0 ? comparison.accountAvgInteractions / barMax : 0}
                color={colors.neutral300}
              />
              {comparison.formatAvgInteractions !== null ? (
                <PerformanceBar
                  label={`${format.plural} average · ${comparison.formatPostCount}`}
                  value={formatCompactNumber(comparison.formatAvgInteractions)}
                  ratio={barMax > 0 ? comparison.formatAvgInteractions / barMax : 0}
                  color={format.color}
                />
              ) : null}
              <Text className="text-caption text-neutral-400">Interactions = likes + comments.</Text>
            </>
          )}
        </FadeIn>

        <FadeIn index={2} className="my-2xl">
          <View className="mb-md flex-row flex-wrap items-center justify-between">
            <Text className="mr-sm text-heading text-navy" accessibilityRole="header">
              Observed
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
        </FadeIn>

        <PostAnalysisSection
          accountId={accountId}
          postId={post.id}
          classification={detail.classification}
          aiConfigured={detail.aiConfigured}
          autoStart={autoAnalyze}
        />

        {openInstagram ? <Button title={`Open on ${platform.name}`} icon={platform.icon} variant="secondary" onPress={openInstagram} /> : null}
        {post.metrics.views === null ? (
          <Text className="mt-md text-center text-caption text-neutral-400">{NOT_AVAILABLE} means {platform.name} did not provide that metric for this post.</Text>
        ) : null}
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
