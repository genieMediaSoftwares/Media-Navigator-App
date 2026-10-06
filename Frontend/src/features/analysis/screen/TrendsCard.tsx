import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { colors, platformColors } from '@/constants/colors';
import { formatCompactNumber } from '@/lib/format';
import { Analysis, AnalysisTrendMetric } from '@/types/analysis';

import { AnalysisCard, SelectButton } from './Pieces';

const METRIC_LABEL: Record<AnalysisTrendMetric, string> = { views: 'Views', likes: 'Likes', comments: 'Comments', engagementRate: 'Engagement' };
const HEIGHT = 170;
const LEFT = 34;
const TOP = 8;
const BOTTOM = 22;

/** Smooth path through the points (Catmull-Rom → cubic Bézier); gaps (null) break the line. */
function smoothSegments(points: Array<{ x: number; y: number } | null>): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    if (p) current.push(p);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function pathOf(seg: Array<{ x: number; y: number }>): string {
  if (seg.length === 1) return `M${seg[0].x - 2},${seg[0].y} L${seg[0].x + 2},${seg[0].y}`;
  let d = `M${seg[0].x},${seg[0].y}`;
  for (let i = 0; i < seg.length - 1; i++) {
    const p0 = seg[i - 1] ?? seg[i];
    const p1 = seg[i];
    const p2 = seg[i + 1];
    const p3 = seg[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Performance Trends: one line per platform in scope, from posts published in each day/week of the
 * period. Counts are summed per bucket; engagement is the typical (median) post. No data = no line.
 */
export function TrendsCard({ analysis }: { analysis: Analysis }) {
  const { trend } = analysis;
  const [metric, setMetric] = useState<AnalysisTrendMetric>(trend.metrics[0] ?? 'likes');
  const active = trend.metrics.includes(metric) ? metric : (trend.metrics[0] ?? 'likes');
  const [width, setWidth] = useState(0);
  const plotW = Math.max(width - LEFT - 4, 1);
  const plotH = HEIGHT - TOP - BOTTOM;

  const { lines, max } = useMemo(() => {
    const all = trend.series.flatMap((s) => s.values[active]).filter((v): v is number => v !== null);
    const top = niceMax(all.length ? Math.max(...all) : 0);
    const n = trend.buckets.length;
    const x = (i: number) => LEFT + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
    const y = (v: number) => TOP + (1 - v / top) * plotH;
    return {
      max: top,
      lines: trend.series
        .filter((s) => s.values[active].some((v) => v !== null))
        .map((s) => ({ s, segments: smoothSegments(s.values[active].map((v, i) => (v === null ? null : { x: x(i), y: y(v) }))) })),
    };
  }, [trend, active, plotW, plotH]);

  const ticks = [max, (max * 2) / 3, max / 3, 0];
  const labelIdx = trend.buckets.length > 1 ? [0, 1, 2, 3, 4].map((k) => Math.round((k / 4) * (trend.buckets.length - 1))) : [0];
  const fmt = (v: number) => (active === 'engagementRate' ? `${Number(v.toFixed(1))}%` : formatCompactNumber(Math.round(v)));

  return (
    <AnalysisCard>
      <View className="mb-sm flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-navy" accessibilityRole="header">
          Performance Trends
        </Text>
        {trend.metrics.length > 0 ? (
          <SelectButton value={active} options={trend.metrics.map((m) => ({ value: m, label: METRIC_LABEL[m] }))} onChange={setMetric} title="Chart metric" accessibilityLabel="Chart metric" />
        ) : null}
      </View>

      {!trend.sufficient || lines.length === 0 ? (
        <View className="items-center rounded-xl bg-neutral-50 px-lg py-xl">
          <Text className="text-center text-label font-semibold text-navy">Not enough historical data yet</Text>
          <Text className="mt-xs text-center text-caption text-neutral-500">Keep your account connected while Media Navigator collects performance data.</Text>
        </View>
      ) : (
        <>
          <View
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            style={{ height: HEIGHT }}
            accessible
            accessibilityLabel={`${METRIC_LABEL[active]} by ${trend.granularity}, ${lines.map((l) => l.s.label).join(', ')}. Highest ${fmt(max)}.`}
          >
            {width > 0 ? (
              <Svg width={width} height={HEIGHT}>
                <Defs>
                  {lines.map(({ s }) => (
                    <LinearGradient key={s.accountId} id={`fill_${s.accountId}`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={platformColors[s.platform].line} stopOpacity={0.22} />
                      <Stop offset="1" stopColor={platformColors[s.platform].line} stopOpacity={0} />
                    </LinearGradient>
                  ))}
                </Defs>
                {ticks.map((t, i) => (
                  <Line key={i} x1={LEFT} x2={width - 4} y1={TOP + (i / 3) * plotH} y2={TOP + (i / 3) * plotH} stroke={colors.neutral100} strokeWidth={1} />
                ))}
                {ticks.map((t, i) => (
                  <SvgText key={`t${i}`} x={LEFT - 6} y={TOP + (i / 3) * plotH + 3} fontSize={9} fill={colors.neutral400} textAnchor="end">
                    {fmt(t)}
                  </SvgText>
                ))}
                {lines.map(({ s, segments }) =>
                  segments.map((seg, k) => (
                    <Path key={`${s.accountId}_f${k}`} d={`${pathOf(seg)} L${seg[seg.length - 1].x},${TOP + plotH} L${seg[0].x},${TOP + plotH} Z`} fill={`url(#fill_${s.accountId})`} />
                  )),
                )}
                {lines.map(({ s, segments }) =>
                  segments.map((seg, k) => (
                    <Path key={`${s.accountId}_l${k}`} d={pathOf(seg)} stroke={platformColors[s.platform].line} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  )),
                )}
                {labelIdx.map((i, k) => (
                  <SvgText
                    key={`x${k}`}
                    x={LEFT + (trend.buckets.length > 1 ? (i / (trend.buckets.length - 1)) * plotW : plotW / 2)}
                    y={HEIGHT - 4}
                    fontSize={9}
                    fill={colors.neutral400}
                    textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'}
                  >
                    {dateLabel(trend.buckets[i])}
                  </SvgText>
                ))}
              </Svg>
            ) : null}
          </View>
          <View className="mt-sm flex-row flex-wrap">
            {lines.map(({ s }) => (
              <View key={s.accountId} className="mb-xs mr-lg flex-row items-center">
                <View className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: platformColors[s.platform].line }} />
                <Text className="text-[11px] text-navy">{s.label}</Text>
              </View>
            ))}
          </View>
          <Text className="mt-xs text-[10px] text-neutral-400">
            {active === 'engagementRate' ? 'Typical engagement rate of posts published' : `${METRIC_LABEL[active]} of posts published`}{' '}
            {trend.rollingDays > 1 ? `in the ${trend.rollingDays} days up to each day` : `each ${trend.granularity}`}.
          </Text>
        </>
      )}
    </AnalysisCard>
  );
}
