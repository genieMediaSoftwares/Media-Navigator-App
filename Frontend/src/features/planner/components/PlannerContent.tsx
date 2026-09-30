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
import { DayOfWeek, PlannerInsights } from '@/types/api';

import { TimingHeatmap } from './TimingHeatmap';

/** Planner success state. Every value comes from GET /api/planner/insights (measured history). */
export function PlannerContent({ insights }: { insights: PlannerInsights }) {
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
