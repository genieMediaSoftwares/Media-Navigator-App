import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, platformColors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { cardNumber, PlatformLogoTile } from '@/features/home/components/PlatformDashboardCard';
import { FORMAT_LABELS } from '@/features/intelligence/labels';
import { formatCompactNumber, formatPercent, formatRelativeTime } from '@/lib/format';
import { Analysis, DistributionItem, PerformanceMetric } from '@/types/analysis';

import { AnalysisCard, ChangeChip } from './Pieces';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TILE: Record<PerformanceMetric, { label: string; icon: IconName; bg: string; color: string }> = {
  views: { label: 'Total Views', icon: 'eye', bg: colors.sky, color: colors.primary },
  likes: { label: 'Total Likes', icon: 'heart', bg: colors.dangerLight, color: '#EF3B3B' },
  comments: { label: 'Total Comments', icon: 'chatbubble-ellipses', bg: colors.violetLight, color: colors.primaryBright },
  posts: { label: 'Total Posts', icon: 'document-text', bg: colors.sky, color: colors.primary },
};

export const PERIOD_LABEL: Record<Analysis['period']['key'], string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };

function periodDates(a: Analysis): string {
  const f = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${f(a.period.start)} – ${f(a.period.end)}`;
}

/** Overall Performance: period totals with the change against the previous period of the same length. */
export function OverallPerformanceCard({ analysis, scopeLabel }: { analysis: Analysis; scopeLabel: string }) {
  const { width } = useWindowDimensions();
  // Narrow phones: "Comments" instead of "Total Comments" so no label is clipped.
  const label = (metric: PerformanceMetric) => (width < 380 ? TILE[metric].label.replace('Total ', '') : TILE[metric].label);
  const headline = analysis.performance.headline;
  const all = analysis.scope === 'all';
  return (
    <AnalysisCard>
      <View className="mb-md flex-row items-start justify-between">
        <View className="flex-1 pr-sm">
          <Text className="text-[17px] font-bold text-navy" accessibilityRole="header">
            Overall Performance
          </Text>
          <Text className="mt-0.5 text-[13px] text-neutral-500">{all ? 'Across all connected accounts' : `${scopeLabel} performance`}</Text>
        </View>
        {headline ? (
          <View className="items-end">
            {headline.changePercent !== null ? <ChangeChip percent={headline.changePercent} size="lg" /> : <Text className="text-[11px] font-semibold text-neutral-400">Comparison unavailable</Text>}
            <Text className="mt-xs text-[10px] text-neutral-500">vs previous {analysis.period.days} days</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row">
        {analysis.performance.tiles.map((tile, i) => {
          const t = TILE[tile.metric];
          return (
            <View
              key={tile.metric}
              className="flex-1 px-1"
              style={i > 0 ? { borderLeftWidth: 1, borderLeftColor: colors.neutral100 } : undefined}
              accessible
              accessibilityLabel={`${t.label}: ${tile.value === null ? 'Not available' : tile.value.toLocaleString()}${tile.changePercent !== null ? `, ${tile.changePercent > 0 ? 'up' : 'down'} ${Math.abs(Math.round(tile.changePercent))}% vs previous period` : ''}`}
            >
              <View className="flex-row items-center">
                <View className="mr-[3px] h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: t.bg }}>
                  <Ionicons name={t.icon} size={11} color={t.color} />
                </View>
                {tile.value === null ? (
                  <Text className="flex-1 text-[9px] leading-[11px] text-neutral-400" numberOfLines={2}>
                    Not available
                  </Text>
                ) : (
                  <Text className="flex-1 text-[14px] font-bold leading-[18px] text-navy" numberOfLines={1}>
                    {cardNumber(tile.value)}
                  </Text>
                )}
              </View>
              <Text className="mt-0.5 text-[9.5px] leading-[12px] text-neutral-500" numberOfLines={1}>
                {label(tile.metric)}
              </Text>
              <View className="mt-1">{tile.value !== null && tile.changePercent !== null ? <ChangeChip percent={tile.changePercent} /> : null}</View>
            </View>
          );
        })}
      </View>

      <Text className="mt-md text-[10px] leading-[14px] text-neutral-400">
        Posts published {periodDates(analysis)} vs the {analysis.period.days} days before.
        {analysis.performance.tiles.some((t) => t.unavailableOn.length > 0)
          ? ` Not reported by ${[...new Set(analysis.performance.tiles.flatMap((t) => t.unavailableOn))].map((p) => platformOption(p).name).join(', ')} for some metrics.`
          : ''}
        {analysis.sync?.lastSyncedAt ? ` Synced ${formatRelativeTime(analysis.sync.lastSyncedAt).toLowerCase()}.` : ''}
      </Text>
    </AnalysisCard>
  );
}

function sliceColor(item: DistributionItem): string {
  if (item.platform && !item.format) return platformColors[item.platform].line;
  return item.format ? FORMAT_LABELS[item.format].color : colors.neutral300;
}

/** Donut of posts published in the period: by platform (All Platforms) or by format (one platform). */
export function DistributionCard({ analysis }: { analysis: Analysis }) {
  const { items, total, kind } = analysis.distribution;
  const { width } = useWindowDimensions();
  // Narrow phones: a smaller donut leaves room for the legend labels.
  const size = width < 380 ? 60 : 72;
  const stroke = width < 380 ? 10 : 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // Each slice starts where the previous ones end (computed up front, not mutated while rendering).
  const slices = items.map((item, i) => ({
    item,
    length: total ? (item.count / total) * circumference : 0,
    start: items.slice(0, i).reduce((acc, prev) => acc + (total ? (prev.count / total) * circumference : 0), 0),
  }));
  return (
    <AnalysisCard className="mr-sm flex-[1.12] p-md">
      <Text className="mb-sm text-[13px] font-bold text-navy" numberOfLines={1} accessibilityRole="header">
        {kind === 'platform' ? 'Content by Platform' : 'Content by Format'}
      </Text>
      {total === 0 ? (
        <Text className="text-[11px] text-neutral-500">No posts published in this period.</Text>
      ) : (
        <View className="flex-row items-center">
          <View style={{ width: size, height: size }} accessible accessibilityLabel={`${total} posts: ${items.map((i) => `${i.label} ${i.percent}%`).join(', ')}`}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.neutral100} strokeWidth={stroke} fill="none" />
              {slices.map(({ item, length, start }) => (
                <Circle
                  key={item.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={sliceColor(item)}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${Math.max(length - 1.5, 0.5)} ${circumference}`}
                  strokeDashoffset={-start}
                />
              ))}
            </Svg>
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text className="text-[15px] font-bold text-navy">{total.toLocaleString()}</Text>
              <Text className="text-[8px] text-neutral-500">Total Posts</Text>
            </View>
          </View>
          <View className="ml-sm flex-1">
            {items.slice(0, 5).map((item) => (
              <View key={item.key} className="mb-1 flex-row items-center">
                <View className="mr-1 h-2 w-2 rounded-full" style={{ backgroundColor: sliceColor(item) }} />
                <Text className="flex-1 text-[10px] text-navy" numberOfLines={1}>
                  {item.label}
                </Text>
                <Text className="text-[10px] font-semibold text-navy">{item.percent}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </AnalysisCard>
  );
}

/** Top Performing Platform (All Platforms) or Format (one platform), chosen from measured data. */
export function TopPerformerCard({ analysis }: { analysis: Analysis }) {
  const top = analysis.top;
  const all = analysis.scope === 'all';
  return (
    <AnalysisCard className="flex-1 p-md">
      <Text className="mb-sm text-[12px] font-bold text-navy" numberOfLines={2} accessibilityRole="header">
        {all ? 'Top Performing Platform' : 'Top Performing Format'}
      </Text>
      {!top ? (
        <Text className="text-[11px] leading-4 text-neutral-500">{analysis.topNote ?? `Not enough data to determine a top ${all ? 'platform' : 'format'}.`}</Text>
      ) : (
        <>
          <View className="mb-sm flex-row items-center">
            {top.kind === 'platform' || !top.format ? (
              <PlatformLogoTile platform={top.platform} size={34} />
            ) : (
              <View className="h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ backgroundColor: FORMAT_LABELS[top.format].light }}>
                <Ionicons name={FORMAT_LABELS[top.format].icon} size={18} color={FORMAT_LABELS[top.format].color} />
              </View>
            )}
            <View className="ml-sm flex-1">
              <Text className="text-[14px] font-bold text-navy" numberOfLines={1}>
                {top.label}
              </Text>
              <Text className="text-[10px] leading-[13px] text-neutral-500" numberOfLines={2}>
                {top.reason}
              </Text>
            </View>
          </View>
          <View className="flex-row rounded-xl bg-sky/60 px-sm py-sm">
            <View className="flex-1 items-center">
              <Text className="text-[15px] font-bold text-navy">{top.metric === 'engagementRate' ? formatPercent(top.value, 1) : formatCompactNumber(top.value)}</Text>
              <Text className="text-[9px] text-neutral-500">{top.metric === 'engagementRate' ? 'Engagement Rate' : 'Typical views'}</Text>
            </View>
            <View className="w-px bg-sky-border" />
            <View className="flex-1 items-center">
              {top.changePercent === null ? (
                <Text className="text-center text-[10px] font-semibold text-neutral-400">No comparison</Text>
              ) : (
                <Text className={`text-[15px] font-bold ${top.changePercent >= 0 ? 'text-success' : 'text-danger'}`}>
                  {top.changePercent >= 0 ? '+' : '−'}
                  {Math.abs(Math.round(top.changePercent))}%
                </Text>
              )}
              <Text className="text-center text-[9px] text-neutral-500">vs previous {analysis.period.days} days</Text>
            </View>
          </View>
        </>
      )}
    </AnalysisCard>
  );
}
