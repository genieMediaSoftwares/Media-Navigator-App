import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Gradient } from '@/components/visual/Gradient';
import { FadeIn } from '@/components/visual/Motion';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { WeekPattern } from '@/features/intelligence/components/WeekPattern';
import { DAY_NAMES, formatHourRange } from '@/lib/format';
import { DayOfWeek, PlannerInsights } from '@/types/api';

import { DaySelector } from './DaySelector';
import { TimingHeatmap } from './TimingHeatmap';
import { WindowCard } from './WindowCard';

function todayIndex(): DayOfWeek {
  // JS getDay(): 0 = Sunday. The API uses 0 = Monday.
  return ((new Date().getDay() + 6) % 7) as DayOfWeek;
}

/** Planner success state. Every cell and window comes from GET /api/planner/insights (measured history). */
export function PlannerContent({ insights }: { insights: PlannerInsights }) {
  const best = useMemo(() => [...insights.recommendedWindows].sort((a, b) => b.score - a.score)[0] ?? null, [insights.recommendedWindows]);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(best?.dayOfWeek ?? todayIndex());

  const windowsForDay = useMemo(
    () => insights.recommendedWindows.filter((window) => window.dayOfWeek === selectedDay).sort((a, b) => b.score - a.score),
    [insights.recommendedWindows, selectedDay],
  );

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
              {best.rationale ? (
                <Text className="mt-md text-label font-normal" style={{ color: colors.onDarkMuted }}>
                  {best.rationale}
                </Text>
              ) : null}
              <Text className="mt-md text-caption" style={{ color: colors.onDarkMuted }}>
                Based on {insights.postsAnalyzed} posts · {insights.timezone}
              </Text>
            </Gradient>
          </View>
        </FadeIn>
      ) : null}

      {insights.heatmap.length > 0 ? (
        <FadeIn index={1} className="mb-2xl">
          <SectionTitle eyebrow="Weekly pattern" eyebrowIcon="bar-chart-outline" eyebrowColor={colors.violet} title="Average interactions by day" />
          <WeekPattern cells={insights.heatmap} />
        </FadeIn>
      ) : null}

      <FadeIn index={2} className="mb-2xl">
        <SectionTitle eyebrow="Time of day" eyebrowIcon="grid-outline" eyebrowColor={colors.violet} title="Engagement by time" description={`Times in ${insights.timezone}. Empty slots have too few posts to measure.`} />
        {insights.heatmap.length === 0 ? (
          <Text className="text-body text-neutral-500">No timing data available yet.</Text>
        ) : (
          <TimingHeatmap cells={insights.heatmap} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        )}
      </FadeIn>

      <View className="mb-xl">
        <DaySelector selected={selectedDay} onSelect={setSelectedDay} />
      </View>

      <SectionTitle title={`${DAY_NAMES[selectedDay]} windows`} description="Measured from your publishing history." />
      {windowsForDay.length === 0 ? (
        <Text className="mb-xl text-body text-neutral-500">No measured windows for {DAY_NAMES[selectedDay]} yet.</Text>
      ) : (
        windowsForDay.map((window, i) => <WindowCard key={window.id} window={window} index={i} isBest={window.id === best?.id} />)
      )}

      <View className="mt-lg">
        <Button title="Schedule a post" icon="add" onPress={() => undefined} disabled />
        <Text className="mt-sm text-center text-caption text-neutral-500">{insights.scheduling?.reason ?? 'Scheduling isn’t available yet.'}</Text>
      </View>
    </View>
  );
}
