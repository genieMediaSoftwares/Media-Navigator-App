import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { describeMetric, describeVsAverage, formatCompactNumber, formatDate, formatPercent, formatVsAverageCompact } from '@/lib/format';
import { IntelligencePost } from '@/types/api';

import { FORMAT_LABELS } from '../labels';
import { MediaThumb } from './MediaThumb';

interface MediaRowProps {
  post: IntelligencePost;
  onPress: () => void;
  /** Trailing call to action, e.g. "Why it worked". */
  actionLabel?: string;
  /** Show the "vs account average" chip. */
  showBaseline?: boolean;
}

/** Compact list row: thumbnail, format, caption and the post's key metrics. No card chrome. */
export function MediaRow({ post, onPress, actionLabel, showBaseline = true }: MediaRowProps) {
  const format = FORMAT_LABELS[post.format];
  const delta = post.vsBaselinePercent;
  const metrics = [
    post.metrics.views !== null ? `${formatCompactNumber(post.metrics.views)} views` : null,
    `${formatCompactNumber(post.metrics.likes)} likes`,
    `${formatCompactNumber(post.metrics.comments)} comments`,
  ].filter(Boolean);

  const a11y = [
    `${format.singular}${post.publishedAt ? `, ${formatDate(post.publishedAt)}` : ''}`,
    post.caption ? post.caption.slice(0, 80) : 'No caption',
    describeMetric(post.metrics.views, 'views'),
    describeMetric(post.metrics.likes, 'likes'),
    describeMetric(post.metrics.comments, 'comments'),
    post.engagementRate !== null ? `${formatPercent(post.engagementRate, 2)} engagement` : 'engagement not available',
    delta !== null ? describeVsAverage(delta) : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={actionLabel ? `Opens ${actionLabel.toLowerCase()}` : 'Opens post performance'}
      className="flex-row py-md active:opacity-80"
    >
      <MediaThumb uri={post.previewUrl} format={post.format} size={76} rounded="xl" />
      <View className="ml-md flex-1">
        <View className="flex-row items-center">
          <Text className="text-overline uppercase tracking-widest" style={{ color: format.color }}>
            {format.singular}
          </Text>
          {post.publishedAt ? <Text className="ml-sm text-caption text-neutral-500">{formatDate(post.publishedAt)}</Text> : null}
        </View>
        <Text className={`mt-xs text-label ${post.caption ? 'text-navy' : 'text-neutral-500'}`} numberOfLines={2}>
          {post.caption ?? 'No caption'}
        </Text>
        <Text className="mt-xs text-caption text-neutral-500" numberOfLines={1}>
          {metrics.join(' · ')}
        </Text>
        <View className="mt-xs flex-row flex-wrap items-center">
          {showBaseline && delta !== null ? (
            <View className={`mr-sm rounded-sm px-sm py-0.5 ${delta >= 0 ? 'bg-success-light' : 'bg-warning-light'}`}>
              <Text className={`text-caption font-semibold ${delta >= 0 ? 'text-success' : 'text-warning'}`}>
                {delta >= 0 ? '▲' : '▼'} {formatVsAverageCompact(delta)}
              </Text>
            </View>
          ) : null}
          {post.engagementRate !== null ? (
            <Text className="mr-sm text-caption text-neutral-500">{formatPercent(post.engagementRate, 2)} eng.</Text>
          ) : null}
          {actionLabel ? <Text className="text-caption font-semibold text-primary">{actionLabel} ›</Text> : null}
        </View>
      </View>
      {!actionLabel ? (
        <View className="justify-center pl-sm">
          <Ionicons name="chevron-forward" size={18} color={colors.neutral400} />
        </View>
      ) : null}
    </Pressable>
  );
}
