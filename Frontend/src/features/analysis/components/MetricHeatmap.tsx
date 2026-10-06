import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { DAY_NAMES, DAY_SHORT_NAMES, formatCompactNumber, formatHour, formatHourRange, formatPercent } from '@/lib/format';
import { HeatmapCell, HeatmapMetric, MetricHeatmap as Heatmap } from '@/types/analysis';

// Five intensity steps. Literal class strings so Tailwind can generate them.
const STEPS = ['bg-primary/10', 'bg-primary/25', 'bg-primary/45', 'bg-primary/70', 'bg-primary'] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const BLOCKS = [0, 3, 6, 9, 12, 15, 18, 21] as const;

export const HEATMAP_LABELS: Record<HeatmapMetric, string> = {
  score: 'Performance',
  views: 'Views',
  likes: 'Likes',
  engagementRate: 'Engagement',
  interactions: 'Interactions',
};

export function formatHeatValue(metric: HeatmapMetric, value: number): string {
  if (metric === 'engagementRate') return formatPercent(value, 2);
  if (metric === 'score') return `score ${Math.round(value)}`;
  return formatCompactNumber(value);
}

/**
 * Day × 3-hour heat map for one metric. Darker = higher for the typical (median) post. Tapping a cell shows its
 * exact average and post count; empty cells had fewer than 2 posts (not measured, not zero).
 */
export function MetricHeatmap({ heatmap, recommended }: { heatmap: Heatmap; recommended?: { dayOfWeek: number; startHour: number } | null }) {
  const lookup = useMemo(() => new Map(heatmap.cells.map((c) => [`${c.dayOfWeek}:${c.startHour}`, c])), [heatmap.cells]);
  // The default highlight needs at least 3 posts, like the server's recommended slot; 2-post cells are shown but not singled out.
  const strongest = useMemo(() => [...heatmap.cells].filter((c) => c.postCount >= 3).sort((a, b) => b.median - a.median)[0] ?? null, [heatmap.cells]);
  // The server's recommended slot is highlighted first so the map and the recommendation agree.
  const recommendedCell = recommended ? (heatmap.cells.find((c) => c.dayOfWeek === recommended.dayOfWeek && c.startHour === recommended.startHour) ?? null) : null;
  const best = recommendedCell ?? strongest;
  const [selected, setSelected] = useState<HeatmapCell | null>(null);
  const shown = selected ?? best;

  if (!heatmap.sufficient) {
    return (
      <Text className="text-label font-normal text-neutral-500">
        Needs {heatmap.minimumRequired} posts with {HEATMAP_LABELS[heatmap.metric].toLowerCase()} data ({heatmap.postsAnalyzed} so far).
      </Text>
    );
  }

  return (
    <View>
      <View className="mb-xs flex-row">
        <View className="w-12" />
        {DAYS.map((day) => (
          <Text key={day} className="flex-1 text-center text-caption text-neutral-500" importantForAccessibility="no">
            {DAY_SHORT_NAMES[day].slice(0, 2)}
          </Text>
        ))}
      </View>
      {BLOCKS.map((start) => (
        <View key={start} className="mb-[3px] flex-row items-center">
          <Text className="w-12 pr-xs text-caption text-neutral-500" numberOfLines={1} accessibilityLabel={formatHourRange(start, start + 3)}>
            {formatHour(start)}
          </Text>
          {DAYS.map((day) => {
            const cell = lookup.get(`${day}:${start}`);
            const step = cell ? STEPS[Math.min(STEPS.length - 1, Math.floor(cell.intensity / 20.01))] : null;
            const isSelected = shown && cell && shown.dayOfWeek === cell.dayOfWeek && shown.startHour === cell.startHour;
            return (
              <Pressable
                key={day}
                disabled={!cell}
                onPress={() => cell && setSelected(cell)}
                accessibilityRole="button"
                accessibilityLabel={`${DAY_NAMES[day]} ${formatHourRange(start, start + 3)}: ${cell ? `${formatHeatValue(heatmap.metric, cell.median)} typical across ${cell.postCount} posts` : 'not enough posts'}`}
                className="flex-1 px-[2px]"
              >
                <View className={`h-7 rounded-md ${step ?? 'bg-neutral-50'} ${isSelected ? 'border-2 border-navy' : ''}`} />
              </Pressable>
            );
          })}
        </View>
      ))}
      <View className="mt-md flex-row items-center">
        <Text className="mr-sm text-caption text-neutral-500">Lower</Text>
        {STEPS.map((s) => (
          <View key={s} className={`mr-xs h-3 w-5 rounded-sm ${s}`} />
        ))}
        <Text className="ml-xs text-caption text-neutral-500">Higher</Text>
      </View>
      {shown ? (
        <View className="mt-md rounded-lg bg-neutral-50 p-md" accessibilityLiveRegion="polite">
          <Text className="text-label font-semibold text-navy">
            {selected ? '' : recommendedCell ? 'Recommended slot: ' : 'Strongest (3+ posts): '}
            {DAY_NAMES[shown.dayOfWeek]}, {formatHourRange(shown.startHour, shown.endHour)}
          </Text>
          <Text className="mt-0.5 text-caption text-neutral-500">
            {formatHeatValue(heatmap.metric, shown.median)} for the typical post · {shown.postCount} posts
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Typical (median) post per weekday as compact bars (from the server's byDay aggregate). */
export function DayBars({ heatmap }: { heatmap: Heatmap }) {
  const max = Math.max(0, ...heatmap.byDay.map((d) => d.median));
  if (!heatmap.sufficient || max <= 0) return null;
  const bestDay = [...heatmap.byDay].sort((a, b) => b.median - a.median)[0];
  return (
    <View className="flex-row items-end" style={{ height: 110 }}>
      {DAYS.map((day) => {
        const d = heatmap.byDay.find((x) => x.dayOfWeek === day);
        const ratio = d ? d.median / max : 0;
        const best = d && bestDay && d.dayOfWeek === bestDay.dayOfWeek;
        return (
          <View
            key={day}
            className="flex-1 items-center"
            accessible
            accessibilityLabel={`${DAY_NAMES[day]}: ${d ? `${formatHeatValue(heatmap.metric, d.median)} typical across ${d.postCount} posts` : 'no posts'}`}
          >
            <View className="w-full items-center justify-end" style={{ height: 84 }}>
              <View style={{ width: '62%', height: Math.max(4, ratio * 84), borderRadius: 6, backgroundColor: !d ? colors.neutral100 : best ? colors.primary : colors.skyBorder }} />
            </View>
            <Text className={`mt-xs text-caption ${best ? 'font-bold text-primary' : 'text-neutral-500'}`}>{DAY_SHORT_NAMES[day].slice(0, 2)}</Text>
          </View>
        );
      })}
    </View>
  );
}
