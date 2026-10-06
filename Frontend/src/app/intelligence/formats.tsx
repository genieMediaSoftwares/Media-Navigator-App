import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { platformOption } from '@/features/accounts/platforms';
import { fetchAiInsights, fetchMediaPage } from '@/features/intelligence/api';
import { FormatMix } from '@/features/intelligence/components/FormatComparison';
import { MediaRow } from '@/features/intelligence/components/MediaRow';
import { TrendBlock } from '@/features/intelligence/components/TrendBlock';
import { formatLabel } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { describeLeadingFormat, formatPlural, leadingFormat, TIER_COPY, TIER_SORT, TierFilter, typicalBadge } from '@/features/intelligence/tiers';
import { useIntelligenceOverview } from '@/features/intelligence/useIntelligenceOverview';
import { useApiResource } from '@/hooks/useApiResource';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { ContentFormat, FormatPerformance, IntelligenceOverview, SocialPlatform } from '@/types/api';

/** One real example of this format in a tier, or a plain note that there is none. */
function TierExample({ accountId, format, tier, version, platform }: { accountId: string; format: ContentFormat; tier: TierFilter; version: string | null; platform: SocialPlatform }) {
  const router = useRouter();
  const fetcher = useCallback(
    () => fetchMediaPage({ accountId, format, tier, sort: TIER_SORT[tier], limit: 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, format, tier, version],
  );
  const { state } = useApiResource(fetcher);
  const post = state.status === 'success' ? state.data.items[0] : undefined;
  return (
    <View className="mb-lg">
      <Text className="text-overline uppercase tracking-widest text-neutral-500">
        {TIER_COPY[tier].label} {formatLabel(format, platform).singular.toLowerCase()}
      </Text>
      {state.status === 'loading' ? (
        <Skeleton className="mt-sm h-20 w-full rounded-xl" />
      ) : post ? (
        <MediaRow
          post={post}
          badge={typicalBadge(post)}
          actionLabel={TIER_COPY[tier].cta}
          onPress={() => router.push({ pathname: '/intelligence/post/[id]', params: { id: post.id, accountId, analyze: '1' } })}
        />
      ) : (
        <Text className="mt-xs text-label font-normal text-neutral-500">None in this group.</Text>
      )}
    </View>
  );
}

/** "What we learned": measured comparison first, then any AI insight that cites this format. */
function Learned({ overview, selected }: { overview: IntelligenceOverview; selected: FormatPerformance }) {
  const name = formatLabel(selected.format, overview.account.platform).plural;
  const lead = leadingFormat(overview.formats);
  let observed: string;
  if (selected.count < 3) {
    observed = `Only ${selected.count} ${formatPlural(selected.format, selected.count)} so far — too few to compare reliably.`;
  } else if (lead && lead.best.format === selected.format) {
    observed = describeLeadingFormat(lead.best, lead.next);
  } else if (lead) {
    observed = `${name} average ${formatCompactNumber(selected.avgInteractions)} interactions. ${formatLabel(lead.best.format, overview.account.platform).plural} lead with ${formatCompactNumber(lead.best.avgInteractions)}.`;
  } else {
    observed = `${name} average ${formatCompactNumber(selected.avgInteractions)} interactions per post.`;
  }

  const canUseAi = overview.aiConfigured && overview.tiers.sufficient;
  return (
    <>
      <TrendBlock eyebrow="What we learned" kind="observed" title={observed} />
      {canUseAi ? <FormatInsight accountId={overview.account.id} format={selected.format} version={overview.account.lastSyncedAt} /> : null}
    </>
  );
}

function FormatInsight({ accountId, format, version }: { accountId: string; format: ContentFormat; version: string | null }) {
  const router = useRouter();
  const fetcher = useCallback(
    async () => intelligenceSession.insights(accountId) ?? fetchAiInsights(accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, version],
  );
  const { state } = useApiResource(fetcher);
  if (state.status !== 'success') return null;
  const insight = state.data.insights.find((i) => i.supportingData.formats.some((f) => f.format === format));
  if (!insight) return null;
  return (
    <TrendBlock
      eyebrow="AI interpretation"
      kind="aiSummary"
      title={insight.title}
      body={insight.observation}
      action={{ label: 'Read the full insight', onPress: () => router.push({ pathname: '/intelligence/insight/[id]', params: { id: insight.id, accountId } }) }}
    />
  );
}

function FormatsContent({ overview, initialFormat }: { overview: IntelligenceOverview; initialFormat: ContentFormat | null }) {
  const router = useRouter();
  const accountId = overview.account.id;
  const byCount = [...overview.formats].sort((a, b) => b.count - a.count);
  const lead = leadingFormat(overview.formats);
  const [format, setFormat] = useState<ContentFormat | null>(initialFormat ?? lead?.best.format ?? byCount[0]?.format ?? null);
  const selected = overview.formats.find((f) => f.format === format) ?? byCount[0];
  const platformName = platformOption(overview.account.platform).name;

  if (!selected) {
    return (
      <View className="flex-1 bg-white p-xl">
        <Text className="text-body text-neutral-500">No synced content yet.</Text>
      </View>
    );
  }
  const label = formatLabel(selected.format, overview.account.platform);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-md">
      <FadeIn className="mb-xl">
        <Text className="text-heading text-navy">Which formats work best</Text>
        <Text className="mb-lg mt-xs text-label font-normal text-neutral-500">What you publish, and how each format performs.</Text>
        <FormatMix counts={overview.archive.formatCounts} />
      </FadeIn>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-xl" contentContainerClassName="px-xl">
        {byCount.map((f) => {
          const isSelected = f.format === selected.format;
          return (
            <Pressable
              key={f.format}
              onPress={() => setFormat(f.format)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`mr-sm min-h-11 flex-row items-center justify-center rounded-full px-lg ${isSelected ? 'bg-navy' : 'bg-neutral-100'}`}
            >
              <View className="mr-xs h-2 w-2 rounded-full" style={{ backgroundColor: formatLabel(f.format, overview.account.platform).color }} />
              <Text className={`text-label ${isSelected ? 'font-semibold text-white' : 'text-navy'}`}>{formatLabel(f.format, overview.account.platform).plural}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FadeIn key={selected.format}>
        <Text className="mb-lg text-display" style={{ color: label.color }} accessibilityRole="header">
          {label.plural}
        </Text>
        <MetricStrip
          metrics={[
            { label: 'Published', value: String(selected.count) },
            { label: selected.viewsSampleSize < selected.count ? `Avg views (${selected.viewsSampleSize})` : 'Avg views', value: selected.avgViews === null ? null : formatCompactNumber(selected.avgViews) },
            { label: 'Avg interactions', value: selected.avgInteractions === null ? null : formatCompactNumber(selected.avgInteractions), accent: label.color },
            { label: 'Engagement', value: selected.avgEngagementRate === null ? null : formatPercent(selected.avgEngagementRate, 2) },
          ]}
        />

        <View className="mt-2xl">
          <Learned overview={overview} selected={selected} />
        </View>

        {overview.tiers.sufficient ? (
          <View className="mt-sm">
            <Text className="mb-md text-title text-navy">Examples from your {label.plural.toLowerCase()}</Text>
            {(['top', 'moderate', 'low'] as const).map((tier) => (
              <TierExample key={tier} accountId={accountId} format={selected.format} tier={tier} version={overview.account.lastSyncedAt} platform={overview.account.platform} />
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push({ pathname: '/intelligence/library', params: { accountId, format: selected.format } })}
          accessibilityRole="button"
          className="mt-sm min-h-11 justify-center self-start"
        >
          <Text className="text-label font-semibold text-primary">
            View all {selected.count} {formatPlural(selected.format, selected.count)} ›
          </Text>
        </Pressable>
        <Text className="mt-lg text-caption text-neutral-400">Averages use only posts where {platformName} provided the metric. Interactions = likes + comments.</Text>
      </FadeIn>
    </ScrollView>
  );
}

/** Format analysis: one format at a time, with measured numbers and real examples. */
export default function FormatAnalysisScreen() {
  const { accountId = '', format } = useLocalSearchParams<{ accountId?: string; format?: ContentFormat }>();
  const { state, reload } = useIntelligenceOverview(accountId);
  if (state.status === 'loading') return <LoadingState message="Loading formats…" />;
  if (state.status === 'success' && state.data.overview) return <FormatsContent overview={state.data.overview} initialFormat={format ?? null} />;
  return (
    <View className="flex-1 bg-white p-xl">
      <ErrorState message={state.status === 'success' ? 'Connect an account to see format performance.' : state.message} onRetry={reload} />
    </View>
  );
}
