import { Text, View } from 'react-native';

import { AnimatedBar } from '@/components/visual/Metrics';
import { colors } from '@/constants/colors';
import { formatLabel } from '@/features/intelligence/labels';
import { formatCompactNumber, formatPercent, NOT_AVAILABLE } from '@/lib/format';
import { ComparisonSet, PostComparisons } from '@/types/analysis';
import { IntelligencePost, SocialPlatform } from '@/types/api';

type Row = { key: keyof Omit<ComparisonSet, 'postCount' | 'score'>; label: string; value: (p: IntelligencePost) => number | null; percent?: boolean };

const ROWS: Row[] = [
  { key: 'views', label: 'Views', value: (p) => p.metrics.views },
  { key: 'likes', label: 'Likes', value: (p) => p.metrics.likes },
  { key: 'comments', label: 'Comments', value: (p) => p.metrics.comments },
  { key: 'shares', label: 'Shares', value: (p) => p.metrics.shares },
  { key: 'saves', label: 'Saves', value: (p) => p.metrics.saves },
  { key: 'engagementRate', label: 'Engagement rate', value: (p) => p.engagementRate, percent: true },
];

const fmt = (v: number | null, percent?: boolean) => (v === null ? NOT_AVAILABLE : percent ? formatPercent(v, 2) : formatCompactNumber(v));
/** Short form for the narrow value column; screen readers get the full wording from `fmt`. */
const short = (v: number | null, percent?: boolean) => (v === null ? 'N/A' : fmt(v, percent));

/**
 * This post against three reference groups — your typical post, typical similar post (same format)
 * and the typical post among your 10 best — metric by metric. Medians are used so one viral post does
 * not set the bar. Bars are scaled per metric; missing values say so.
 */
export function ComparisonView({ post, comparisons, score, platform }: { post: IntelligencePost; comparisons: PostComparisons; score: number | null; platform: SocialPlatform }) {
  const similar = formatLabel(comparisons.similar.format, platform);
  const groups = [
    { name: 'This post', color: colors.primaryBright, get: (row: Row) => row.value(post) },
    { name: 'Your typical post', color: colors.neutral300, get: (row: Row) => comparisons.account[row.key] },
    { name: `Typical ${similar.singular.toLowerCase()} (${comparisons.similar.postCount})`, color: colors.violet, get: (row: Row) => comparisons.similar[row.key] },
    { name: `Typical of your best ${comparisons.best.postCount}`, color: colors.success, get: (row: Row) => comparisons.best[row.key] },
  ];
  return (
    <View>
      <View className="mb-lg flex-row flex-wrap">
        {groups.map((g) => (
          <View key={g.name} className="mb-xs mr-md flex-row items-center">
            <View className="mr-xs h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
            <Text className="text-caption text-neutral-500">{g.name}</Text>
          </View>
        ))}
      </View>
      <View className="mb-lg flex-row justify-between rounded-lg bg-neutral-50 p-md">
        <Text className="text-label text-navy">Performance score</Text>
        <Text className="text-label font-semibold text-navy">
          {score ?? '–'} · typical {comparisons.account.score ?? '–'} · best {comparisons.best.score ?? '–'}
        </Text>
      </View>
      {ROWS.map((row) => {
        const values = groups.map((g) => g.get(row));
        const max = Math.max(0, ...values.filter((v): v is number => v !== null));
        if (values.every((v) => v === null)) {
          return (
            <View key={row.key} className="mb-lg">
              <Text className="text-label font-semibold text-navy">{row.label}</Text>
              <Text className="text-caption text-neutral-400">{NOT_AVAILABLE}: the platform did not provide it for these posts</Text>
            </View>
          );
        }
        return (
          <View key={row.key} className="mb-xl">
            <Text className="mb-sm text-label font-semibold text-navy">{row.label}</Text>
            {groups.map((g, i) => (
              <View key={g.name} className="mb-xs flex-row items-center" accessible accessibilityLabel={`${row.label}, ${g.name}: ${fmt(values[i], row.percent)}`}>
                <View className="flex-1">
                  <AnimatedBar ratio={values[i] !== null && max > 0 ? (values[i] as number) / max : 0} color={g.color} height={i === 0 ? 10 : 7} />
                </View>
                <Text className={`ml-md w-20 text-right text-caption ${i === 0 ? 'font-bold text-navy' : 'text-neutral-500'}`}>{short(values[i], row.percent)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
