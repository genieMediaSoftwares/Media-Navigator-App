import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { fetchIntelligenceOverview, fetchMediaPage } from '@/features/intelligence/api';
import { EvidenceTag } from '@/features/intelligence/components/Evidence';
import { FormatComparison, FormatMix } from '@/features/intelligence/components/FormatComparison';
import { MediaRail, tileFromPost } from '@/features/intelligence/components/MediaTile';
import { FORMAT_LABELS } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { ContentFormat, FormatPerformance, IntelligenceOverview } from '@/types/api';

/** The real top posts of one format, as a small media rail. */
function TopOfFormat({ accountId, format }: { accountId: string; format: ContentFormat }) {
  const router = useRouter();
  const fetcher = useCallback(() => fetchMediaPage({ accountId, format, sort: 'interactions', limit: 6 }), [accountId, format]);
  const { state } = useApiResource(fetcher);
  if (state.status === 'loading') return <Skeleton className="h-36 w-full rounded-2xl" />;
  if (state.status !== 'success' || state.data.items.length === 0) return null;
  return (
    <MediaRail
      items={state.data.items.map(tileFromPost)}
      width={116}
      aspect={1.25}
      onPress={(item) => router.push({ pathname: '/intelligence/post/[id]', params: { id: item.id, accountId } })}
    />
  );
}

function FormatStory({ format, accountId }: { format: FormatPerformance; accountId: string }) {
  const router = useRouter();
  const label = FORMAT_LABELS[format.format];
  return (
    <View className="mb-2xl">
      <View className="mb-md flex-row items-center">
        <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: label.light }}>
          <Ionicons name={label.icon} size={20} color={label.color} />
        </View>
        <View className="ml-md flex-1">
          <Text className="text-heading text-navy" accessibilityRole="header">
            {label.plural}
          </Text>
          <Text className="text-caption text-neutral-500">{format.count} published</Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/intelligence/library', params: { accountId, format: format.format, sort: 'interactions' } })}
          accessibilityRole="button"
          accessibilityLabel={`View all ${label.plural}`}
          className="min-h-11 justify-center"
        >
          <Text className="text-label font-semibold" style={{ color: label.color }}>
            View all
          </Text>
        </Pressable>
      </View>
      <MetricStrip
        metrics={[
          { label: 'avg interactions', value: format.avgInteractions === null ? null : formatCompactNumber(format.avgInteractions), accent: label.color },
          { label: 'avg likes', value: format.avgLikes === null ? null : formatCompactNumber(format.avgLikes) },
          { label: 'avg comments', value: format.avgComments === null ? null : formatCompactNumber(format.avgComments) },
        ]}
      />
      <View className="mt-md">
        <MetricStrip
          metrics={[
            { label: format.avgViews === null ? 'avg views' : `avg views (${format.viewsSampleSize}/${format.count})`, value: format.avgViews === null ? null : formatCompactNumber(format.avgViews) },
            { label: 'avg engagement', value: format.avgEngagementRate === null ? null : formatPercent(format.avgEngagementRate, 2) },
          ]}
        />
      </View>
      <View className="mt-lg">
        <Overline className="mb-sm">Top {label.plural.toLowerCase()}</Overline>
        <TopOfFormat accountId={accountId} format={format.format} />
      </View>
    </View>
  );
}

function FormatsContent({ overview }: { overview: IntelligenceOverview }) {
  const accountId = overview.account.id;
  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-md">
      <FadeIn>
        <View className="mb-sm flex-row items-center justify-between">
          <Overline icon="layers-outline" color={colors.magenta}>
            Publishing mix
          </Overline>
          <EvidenceTag kind="observed" />
        </View>
        <FormatMix counts={overview.archive.formatCounts} />
      </FadeIn>
      <FadeIn index={1} className="mb-2xl mt-xl">
        <Text className="mb-xs text-heading text-navy">Average interactions per post</Text>
        <FormatComparison formats={overview.formats} />
      </FadeIn>
      {overview.formats.map((format, i) => (
        <FadeIn key={format.format} index={i + 2}>
          <FormatStory format={format} accountId={accountId} />
        </FadeIn>
      ))}
      <Text className="text-caption text-neutral-400">Averages use only posts where Instagram provided the metric. {overview.definitions.interactions}</Text>
    </ScrollView>
  );
}

export default function FormatPerformanceScreen() {
  const { accountId = '' } = useLocalSearchParams<{ accountId?: string }>();
  const cached = intelligenceSession.overview(accountId);
  if (cached) return <FormatsContent overview={cached} />;
  return <FormatsLoader accountId={accountId} />;
}

function FormatsLoader({ accountId }: { accountId: string }) {
  const fetcher = useCallback(() => fetchIntelligenceOverview(accountId || null), [accountId]);
  const { state, reload } = useApiResource(fetcher);
  if (state.status === 'loading') return <LoadingState message="Loading format performance…" />;
  if (state.status === 'success' && state.data.overview) return <FormatsContent overview={state.data.overview} />;
  return (
    <View className="flex-1 bg-white p-xl">
      <ErrorState message={state.status === 'success' ? 'Connect Instagram to see format performance.' : state.message} onRetry={reload} />
    </View>
  );
}
