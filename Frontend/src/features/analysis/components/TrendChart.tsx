import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { colors } from '@/constants/colors';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { TrendPoint } from '@/types/analysis';

type ChartMetric = 'views' | 'likes' | 'engagementRate';

const METRICS: Array<{ value: ChartMetric; label: string }> = [
  { value: 'views', label: 'Views' },
  { value: 'likes', label: 'Likes' },
  { value: 'engagementRate', label: 'Engagement' },
];

const HEIGHT = 150;
const PAD_TOP = 12;
const PAD_BOTTOM = 8;

function formatValue(metric: ChartMetric, value: number): string {
  return metric === 'engagementRate' ? formatPercent(value, 2) : formatCompactNumber(value);
}

function periodLabel(iso: string, granularity: 'week' | 'month'): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return granularity === 'month'
    ? date.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Average per post over time, one line, one metric at a time. Periods without the metric are gaps,
 * not zeros. Values come from GET /api/intelligence/dashboard.
 */
export function TrendChart({ points, granularity }: { points: TrendPoint[]; granularity: 'week' | 'month' }) {
  const [metric, setMetric] = useState<ChartMetric>(() => (points.some((p) => p.views !== null) ? 'views' : 'likes'));
  const [width, setWidth] = useState(0);

  const { path, dots, max, min, latest, first } = useMemo(() => {
    const values = points.map((p) => p[metric]);
    const present = values.filter((v): v is number => v !== null);
    const hi = present.length ? Math.max(...present) : 0;
    const lo = present.length ? Math.min(...present) : 0;
    const span = hi - lo || 1;
    const step = points.length > 1 ? width / (points.length - 1) : 0;
    const y = (v: number) => PAD_TOP + (1 - (v - lo) / span) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
    let d = '';
    let pen = false;
    const pts: Array<{ x: number; y: number }> = [];
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      const x = points.length > 1 ? i * step : width / 2;
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
      pts.push({ x, y: y(v) });
    });
    const firstPresent = values.find((v) => v !== null) ?? null;
    const lastPresent = [...values].reverse().find((v) => v !== null) ?? null;
    return { path: d, dots: pts, max: hi, min: lo, latest: lastPresent, first: firstPresent };
  }, [points, metric, width]);

  const available = METRICS.filter((m) => points.some((p) => p[m.value] !== null));
  if (points.length < 2 || available.length === 0) {
    return <Text className="text-label font-normal text-neutral-500">Trends appear once posts span at least two {granularity}s.</Text>;
  }
  const change = first !== null && latest !== null && first > 0 ? Math.round(((latest - first) / first) * 100) : null;

  return (
    <View>
      {available.length > 1 ? (
        <View className="mb-lg">
          <SegmentedControl segments={available} value={metric} onChange={setMetric} />
        </View>
      ) : null}
      <View className="mb-sm flex-row items-end justify-between">
        <View>
          <Text className="text-caption text-neutral-500">Latest {granularity}, typical post (median)</Text>
          <Text className="text-heading text-navy">{latest === null ? 'Not available' : formatValue(metric, latest)}</Text>
        </View>
        {change !== null ? (
          <Text className={`text-label font-semibold ${change >= 0 ? 'text-success' : 'text-warning'}`}>
            {change >= 0 ? '+' : '−'}
            {Math.abs(change)}% since {periodLabel(points[0].periodStart, granularity)}
          </Text>
        ) : null}
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: HEIGHT }}
        accessible
        accessibilityLabel={`${METRICS.find((m) => m.value === metric)?.label} per post by ${granularity}: from ${first === null ? 'not available' : formatValue(metric, first)} to ${latest === null ? 'not available' : formatValue(metric, latest)}. Highest ${formatValue(metric, max)}, lowest ${formatValue(metric, min)}.`}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {[0, 0.5, 1].map((t) => (
              <Line key={t} x1={0} x2={width} y1={PAD_TOP + t * (HEIGHT - PAD_TOP - PAD_BOTTOM)} y2={PAD_TOP + t * (HEIGHT - PAD_TOP - PAD_BOTTOM)} stroke={colors.neutral100} strokeWidth={1} />
            ))}
            <Path d={path} stroke={colors.primaryBright} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {dots.length > 0 ? <Circle cx={dots[dots.length - 1].x} cy={dots[dots.length - 1].y} r={4} fill={colors.primaryBright} /> : null}
          </Svg>
        ) : null}
      </View>
      <View className="mt-xs flex-row justify-between">
        <Text className="text-caption text-neutral-400">{periodLabel(points[0].periodStart, granularity)}</Text>
        <Text className="text-caption text-neutral-400">
          High {formatValue(metric, max)} · Low {formatValue(metric, min)}
        </Text>
        <Text className="text-caption text-neutral-400">{periodLabel(points[points.length - 1].periodStart, granularity)}</Text>
      </View>
    </View>
  );
}
