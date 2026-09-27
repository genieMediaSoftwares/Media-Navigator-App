import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/constants/colors';
import { DAY_NAMES, DAY_SHORT_NAMES, formatCompactNumber } from '@/lib/format';
import { TimingCell } from '@/types/api';

const CHART_HEIGHT = 96;

interface DayStat {
  day: number;
  avgInteractions: number | null;
  posts: number;
}

/** Aggregates the Worker's measured day×time cells to a weighted average per weekday. */
export function daysFromCells(cells: TimingCell[]): DayStat[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const dayCells = cells.filter((c) => c.dayOfWeek === day);
    const posts = dayCells.reduce((s, c) => s + c.postCount, 0);
    const total = dayCells.reduce((s, c) => s + c.avgInteractions * c.postCount, 0);
    return { day, posts, avgInteractions: posts > 0 ? Math.round((total / posts) * 10) / 10 : null };
  });
}

function Column({ stat, ratio, best }: { stat: DayStat; ratio: number; best: boolean }) {
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withTiming(stat.avgInteractions === null ? 4 : Math.max(6, ratio * CHART_HEIGHT), { duration: 600 });
  }, [ratio, stat.avgInteractions, height]);
  const style = useAnimatedStyle(() => ({ height: height.value }));
  const color = stat.avgInteractions === null ? colors.neutral200 : best ? colors.violet : colors.skyBorder;

  return (
    <View
      className="flex-1 items-center"
      accessible
      accessibilityLabel={`${DAY_NAMES[stat.day]}: ${
        stat.avgInteractions === null ? 'no measured posts' : `${formatCompactNumber(stat.avgInteractions)} average interactions across ${stat.posts} posts`
      }${best ? ', strongest day' : ''}`}
    >
      <Text className="mb-xs text-caption" style={{ color: best ? colors.violet : colors.neutral400, fontWeight: best ? '700' : '400' }}>
        {stat.avgInteractions === null ? '–' : formatCompactNumber(stat.avgInteractions)}
      </Text>
      <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
        <Animated.View className="w-7 rounded-lg" style={[{ backgroundColor: color }, style]} />
      </View>
      <Text className={`mt-sm text-caption ${best ? 'font-bold text-navy' : 'text-neutral-500'}`}>{DAY_SHORT_NAMES[stat.day].slice(0, 1)}</Text>
    </View>
  );
}

/** Weekly engagement pattern from measured timing cells. Days without posts show a flat stub. */
export function WeekPattern({ cells }: { cells: TimingCell[] }) {
  const days = useMemo(() => daysFromCells(cells), [cells]);
  const max = Math.max(0, ...days.map((d) => d.avgInteractions ?? 0));
  const bestDay = days.reduce<DayStat | null>((best, d) => (d.avgInteractions !== null && (best === null || d.avgInteractions > (best.avgInteractions ?? 0)) ? d : best), null);

  return (
    <View className="flex-row">
      {days.map((stat) => (
        <Column key={stat.day} stat={stat} ratio={max > 0 && stat.avgInteractions !== null ? stat.avgInteractions / max : 0} best={bestDay?.day === stat.day} />
      ))}
    </View>
  );
}
