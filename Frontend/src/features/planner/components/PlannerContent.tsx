import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { FadeIn } from '@/components/visual/Motion';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { EvidenceTag } from '@/features/intelligence/components/Evidence';
import { WeekPattern } from '@/features/intelligence/components/WeekPattern';
import { DAY_NAMES, formatCompactNumber, formatHourRange } from '@/lib/format';
import { DayBars, HEATMAP_LABELS, MetricHeatmap } from '@/features/analysis/components/MetricHeatmap';
import { PostingWindowCard } from '@/features/analysis/components/PostingWindowCard';
import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { HeatmapMetric } from '@/types/analysis';
import { DayOfWeek, PlannerInsights } from '@/types/api';

import { TimingHeatmap } from './TimingHeatmap';

const HEATMAP_ORDER: HeatmapMetric[] = ['score', 'views', 'likes', 'engagementRate'];

/**
 * Planner with the measured recommendation (best day, time, confidence, why) and day × time heat maps
 * per metric. Falls back to the interaction-only view for servers without the analysis fields.
 */
export function PlannerContent({ insights }: { insights: PlannerInsights }) {
  if (insights.recommendation && insights.heatmaps) {
    return <MetricPlanner insights={insights} recommendation={insights.recommendation} heatmaps={insights.heatmaps} />;
  }
  return <LegacyPlanner insights={insights} />;
}

function MetricPlanner({
  insights,
  recommendation,
  heatmaps,
}: {
  insights: PlannerInsights;
  recommendation: NonNullable<PlannerInsights['recommendation']>;
  heatmaps: NonNullable<PlannerInsights['heatmaps']>;
}) {
  const available = HEATMAP_ORDER.filter((m) => heatmaps[m]?.sufficient);
  const [metric, setMetric] = useState<HeatmapMetric>(available[0] ?? 'score');
  const heatmap = heatmaps[metric];
  // Highlight what the card recommends (best day at best time); the single best cell only when the card has no pair.
  const recommendedCell =
    recommendation.bestDay && recommendation.bestTime
      ? { dayOfWeek: recommendation.bestDay.dayOfWeek, startHour: recommendation.bestTime.startHour }
      : recommendation.bestSlot;

  return (
    <View>
      <FadeIn className="mb-2xl">
        <PostingWindowCard recommendation={recommendation} />
      </FadeIn>

      {available.length > 0 && heatmap ? (
        <>
          <FadeIn index={1} className="mb-xl">
            {available.length > 1 ? (
              <SegmentedControl segments={available.map((value) => ({ value, label: HEATMAP_LABELS[value] }))} value={metric} onChange={setMetric} />
            ) : null}
          </FadeIn>
          <FadeIn index={2} className="mb-2xl">
            <SectionTitle title="Best days" description={`${HEATMAP_LABELS[metric]} of the typical post, by the day you published.`} />
            <DayBars heatmap={heatmap} />
          </FadeIn>
          <FadeIn index={3} className="mb-2xl">
            <SectionTitle title="Day × time" description={`Darker = higher ${HEATMAP_LABELS[metric].toLowerCase()} for the typical post. Tap a cell for its numbers. Times in ${insights.timezone}; empty cells have fewer than 2 posts.`} />
            <MetricHeatmap heatmap={heatmap} recommended={recommendedCell} />
          </FadeIn>
        </>
      ) : null}

      <View className="items-center rounded-2xl bg-neutral-50 p-lg">
        <Text className="text-label font-semibold text-navy">Scheduling isn’t available yet.</Text>
        {insights.scheduling?.reason ? <Text className="mt-xs text-center text-caption text-neutral-500">{insights.scheduling.reason}</Text> : null}
      </View>
    </View>
  );
}

function LegacyPlanner({ insights }: { insights: PlannerInsights }) {
  const best = useMemo(() => [...insights.recommendedWindows].sort((a, b) => b.score - a.score)[0] ?? null, [insights.recommendedWindows]);
  // The measured cell behind the best window (average interactions and post count).
  const bestCell = best ? (insights.heatmap.find((c) => c.dayOfWeek === best.dayOfWeek && c.startHour === best.startHour) ?? null) : null;
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>((best?.dayOfWeek ?? 0) as DayOfWeek);
  const typical = insights.baseline?.typicalInteractions ?? null;

  return (
    <View>
      {best ? (
        <FadeIn className="mb-2xl">
          <View style={elevation.float}>
            <Gradient name="brand" style={{ borderRadius: 28, padding: 22 }}>
              <Overline icon="flash" color={colors.onDarkMuted}>
                Best measured window
              </Overline>
              <Text className="mt-sm text-display text-white">{DAY_NAMES[best.dayOfWeek]}</Text>
              <Text className="text-heading text-white">{formatHourRange(best.startHour, best.endHour)}</Text>
              {bestCell ? (
                <Text className="mt-md text-body text-white">
                  {formatCompactNumber(bestCell.avgInteractions)} average interactions · {bestCell.postCount} posts
                </Text>
              ) : null}
              <Text className="mt-xs text-caption" style={{ color: colors.onDarkMuted }}>
                Based on {insights.postsAnalyzed} posts · {insights.timezone}
              </Text>
            </Gradient>
          </View>
        </FadeIn>
      ) : null}

      {best && bestCell ? (
        <FadeIn index={1} className="mb-2xl">
          <View className="mb-sm flex-row flex-wrap items-center justify-between">
            <Text className="mr-sm text-heading text-navy" accessibilityRole="header">
              Why this time?
            </Text>
            <EvidenceTag kind="observed" />
          </View>
          <Text className="text-body text-navy-light">
            Posts you published on {DAY_NAMES[best.dayOfWeek]}s between {formatHourRange(best.startHour, best.endHour)} averaged{' '}
            {formatCompactNumber(bestCell.avgInteractions)} interactions
            {typical !== null ? `, while your typical post gets ${formatCompactNumber(typical)}` : ''}.
            {bestCell.postCount < 5 ? ` That is based on ${bestCell.postCount} posts, so treat it as a time to test rather than a rule.` : ''}
          </Text>
        </FadeIn>
      ) : null}

      {insights.heatmap.length > 0 ? (
        <FadeIn index={2} className="mb-2xl">
          <SectionTitle title="By day" description="Average interactions per post, by the day you published." />
          <WeekPattern cells={insights.heatmap} />
        </FadeIn>
      ) : null}

      {insights.heatmap.length > 0 ? (
        <FadeIn index={3} className="mb-2xl">
          <SectionTitle title="By time of day" description={`Darker = more interactions. Times in ${insights.timezone}. Empty slots have too few posts to measure.`} />
          <TimingHeatmap cells={insights.heatmap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        </FadeIn>
      ) : null}

      <View className="items-center rounded-2xl bg-neutral-50 p-lg">
        <Text className="text-label font-semibold text-navy">Scheduling isn’t available yet.</Text>
        {insights.scheduling?.reason ? <Text className="mt-xs text-center text-caption text-neutral-500">{insights.scheduling.reason}</Text> : null}
      </View>
    </View>
  );
}
