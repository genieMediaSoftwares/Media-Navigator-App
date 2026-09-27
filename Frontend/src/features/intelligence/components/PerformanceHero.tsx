import { Pressable, ScrollView, Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { MetricPill, MetricStrip, SparkBars } from '@/components/visual/Metrics';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { formatCompactNumber, formatPercent, NOT_AVAILABLE } from '@/lib/format';
import { IntelligenceOverview, IntelligencePost } from '@/types/api';

interface PerformanceHeroProps {
  overview: IntelligenceOverview;
  /** Most recent posts (newest first) from /api/intelligence/media; null while loading. */
  recent: IntelligencePost[] | null;
  onExplain: () => void;
}

/**
 * The one brand-gradient surface on Intelligence: a headline metric, a real per-post chart of the
 * latest posts, and the account's supporting numbers. Only values returned by the API appear.
 */
export function PerformanceHero({ overview, recent, onExplain }: PerformanceHeroProps) {
  const { summary, archive } = overview;
  const useEngagement = summary.avgEngagementRate !== null;
  const heroValue = useEngagement
    ? formatPercent(summary.avgEngagementRate, 2)
    : summary.avgInteractions !== null
      ? formatCompactNumber(summary.avgInteractions)
      : null;
  const heroLabel = `${useEngagement ? 'avg engagement' : 'avg interactions'} · all ${archive.syncedCount} synced posts`;
  const skewed =
    overview.baseline.avgInteractions !== null && overview.baseline.medianInteractions !== null && overview.baseline.avgInteractions > overview.baseline.medianInteractions * 3;

  // Oldest → newest so the chart reads left to right in time.
  const chart = recent ? [...recent].reverse().map((p) => p.interactions) : null;

  const pills: { icon: 'eye-outline' | 'radio-outline' | 'layers-outline'; label: string; value: string }[] = [];
  if (summary.totalViews !== null) pills.push({ icon: 'eye-outline', label: `views · ${summary.viewsAvailableCount} posts`, value: formatCompactNumber(summary.totalViews) });
  if (summary.reach) pills.push({ icon: 'radio-outline', label: 'reach (day)', value: formatCompactNumber(summary.reach.value) });
  if (summary.impressions) pills.push({ icon: 'layers-outline', label: 'impressions (day)', value: formatCompactNumber(summary.impressions.value) });

  return (
    <View className="mb-2xl" style={elevation.float}>
      <Gradient name="brand" style={{ borderRadius: 28, padding: 22, overflow: 'hidden' }}>
        <View className="flex-row items-start justify-between">
          <Overline icon="pulse" color={colors.onDarkMuted}>
            Content performance
          </Overline>
          <Pressable onPress={onExplain} accessibilityRole="button" accessibilityLabel="How metrics are calculated" hitSlop={8} className="-mr-sm -mt-sm h-11 w-11 items-center justify-center">
            <Text className="text-label font-semibold" style={{ color: colors.onDarkMuted }}>
              ⓘ
            </Text>
          </Pressable>
        </View>

        <View className="mt-xs flex-row items-end">
          <View className="flex-1" accessible accessibilityLabel={`${heroValue ?? NOT_AVAILABLE} ${heroLabel}`}>
            {heroValue !== null ? (
              <Text className="text-hero text-white">{heroValue}</Text>
            ) : (
              <Text className="text-heading" style={{ color: colors.onDarkMuted }}>
                {NOT_AVAILABLE}
              </Text>
            )}
            <Text className="text-label font-normal" style={{ color: colors.onDarkMuted }}>
              {heroLabel}
            </Text>
            {skewed ? (
              <Text className="mt-xs text-caption" style={{ color: colors.onDarkMuted }}>
                Lifted by top posts · typical post {formatCompactNumber(overview.baseline.medianInteractions)} interactions
              </Text>
            ) : null}
          </View>
          {chart && chart.length >= 3 ? (
            <View style={{ width: 112 }} accessible accessibilityLabel={`Interactions on your last ${chart.length} posts, oldest to newest`}>
              <SparkBars values={chart} height={48} />
              <Text className="mt-xs text-right text-caption" style={{ color: colors.onDarkMuted }}>
                interactions · last {chart.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="my-xl h-px" style={{ backgroundColor: colors.onDarkSubtle }} />

        <MetricStrip
          tone="dark"
          metrics={[
            { label: 'Followers', value: summary.followers === null ? null : formatCompactNumber(summary.followers) },
            { label: 'Posts', value: summary.profileMediaCount === null ? null : formatCompactNumber(summary.profileMediaCount) },
            { label: 'Interactions', value: archive.totalInteractions === null ? null : formatCompactNumber(archive.totalInteractions) },
          ]}
        />

        {pills.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-[22px] mt-lg" contentContainerStyle={{ paddingHorizontal: 22 }}>
            {pills.map((pill) => (
              <MetricPill key={pill.label} tone="dark" icon={pill.icon} label={pill.label} value={pill.value} />
            ))}
          </ScrollView>
        ) : null}
      </Gradient>
    </View>
  );
}
