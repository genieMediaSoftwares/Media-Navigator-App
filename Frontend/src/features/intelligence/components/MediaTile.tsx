import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, memo } from 'react';
import { FlatList, Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { PressableScale } from '@/components/visual/Motion';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { describeMetric, describeVsAverage, formatCompactNumber, formatDate, formatVsAverageCompact } from '@/lib/format';
import { ContentFormat, InstagramDashboardPost, IntelligencePost } from '@/types/api';

import { classifyFormat, FORMAT_LABELS } from '../labels';
import { MediaThumb } from './MediaThumb';

/** The fields a media tile renders. Every value comes from the API; null metrics are omitted, never zero-filled. */
export interface MediaTileData {
  id: string;
  format: ContentFormat;
  previewUrl: string | null;
  caption: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  vsBaselinePercent: number | null;
}

export function tileFromPost(post: IntelligencePost): MediaTileData {
  return {
    id: post.id,
    format: post.format,
    previewUrl: post.previewUrl,
    caption: post.caption,
    publishedAt: post.publishedAt,
    views: post.metrics.views,
    likes: post.metrics.likes,
    comments: post.metrics.comments,
    vsBaselinePercent: post.vsBaselinePercent,
  };
}

export function tileFromDashboardPost(post: InstagramDashboardPost): MediaTileData {
  const format = classifyFormat(post.mediaType, post.mediaProductType);
  const isVideo = format === 'REEL' || format === 'VIDEO';
  return {
    id: post.id,
    format,
    previewUrl: (isVideo ? post.thumbnailUrl : post.mediaUrl) ?? post.thumbnailUrl ?? null,
    caption: post.caption,
    publishedAt: post.timestamp,
    views: null,
    likes: post.likeCount,
    comments: post.commentsCount,
    vsBaselinePercent: null,
  };
}

type IconName = ComponentProps<typeof Ionicons>['name'];

function OverlayStat({ icon, value }: { icon: IconName; value: number }) {
  return (
    <View className="mr-md flex-row items-center">
      <Ionicons name={icon} size={13} color={colors.white} />
      <Text className="ml-1 text-caption font-semibold text-white">{formatCompactNumber(value)}</Text>
    </View>
  );
}

interface MediaTileProps {
  item: MediaTileData;
  width: number;
  /** Height ÷ width. 1 = square, 1.25 = Instagram portrait. */
  aspect?: number;
  onPress: () => void;
  /** Small line under the metrics, e.g. "Why it worked". */
  cta?: string;
  showDelta?: boolean;
  showDate?: boolean;
  compact?: boolean;
}

/**
 * The user's own media as the primary visual: image, bottom scrim with real metrics, format badge
 * and (optionally) the measured difference from the account average.
 */
export const MediaTile = memo(function MediaTile({ item, width, aspect = 1, onPress, cta, showDelta = false, showDate = false, compact = false }: MediaTileProps) {
  const format = FORMAT_LABELS[item.format];
  const height = width * aspect;
  const delta = item.vsBaselinePercent;
  const a11y = [
    format.singular,
    item.publishedAt ? formatDate(item.publishedAt) : null,
    item.caption ? item.caption.slice(0, 60) : 'No caption',
    item.views !== null ? describeMetric(item.views, 'views') : null,
    describeMetric(item.likes, 'likes'),
    describeMetric(item.comments, 'comments'),
    showDelta && delta !== null ? describeVsAverage(delta) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={cta ? `Opens ${cta.toLowerCase()}` : 'Opens post performance'}
      style={[{ width, height, borderRadius: compact ? 12 : 20, overflow: 'hidden' }, compact ? undefined : elevation.float]}
    >
      <View style={{ width, height, borderRadius: compact ? 12 : 20, overflow: 'hidden' }}>
        <MediaThumb uri={item.previewUrl} format={item.format} rounded="none" />

        {!compact ? (
          <View className="absolute left-sm top-sm flex-row items-center rounded-full px-sm py-1" style={{ backgroundColor: colors.backdrop }}>
            <Ionicons name={format.icon} size={12} color={colors.white} />
            <Text className="ml-1 text-overline uppercase text-white">{format.singular}</Text>
          </View>
        ) : null}
        {showDelta && delta !== null ? (
          <View className="absolute right-sm top-sm rounded-full px-sm py-1" style={{ backgroundColor: delta >= 0 ? colors.success : colors.warning }}>
            <Text className="text-caption font-bold text-white">
              {delta >= 0 ? '▲' : '▼'} {formatVsAverageCompact(delta)}
            </Text>
          </View>
        ) : null}

        <Gradient name="scrim" direction="vertical" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(height * 0.5, 64), justifyContent: 'flex-end', padding: compact ? 8 : 14 }}>
          {!compact && item.caption ? (
            <Text className="mb-xs text-label font-semibold text-white" numberOfLines={2}>
              {item.caption}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center">
            {item.views !== null ? <OverlayStat icon="eye" value={item.views} /> : null}
            {item.likes !== null ? <OverlayStat icon="heart" value={item.likes} /> : null}
            {!compact && item.comments !== null ? <OverlayStat icon="chatbubble" value={item.comments} /> : null}
          </View>
          {showDate && item.publishedAt ? <Text className="mt-0.5 text-caption" style={{ color: colors.onDarkMuted }}>{formatDate(item.publishedAt)}</Text> : null}
          {cta ? <Text className="mt-sm text-label font-bold text-white">{cta} →</Text> : null}
        </Gradient>
      </View>
    </PressableScale>
  );
});

interface MediaRailProps {
  items: MediaTileData[];
  width: number;
  aspect?: number;
  onPress: (item: MediaTileData) => void;
  cta?: string;
  showDelta?: boolean;
  showDate?: boolean;
  /** Horizontal inset matching the screen gutter so tiles align with content above. */
  inset?: number;
}

/** Horizontally scrolling, snapping rail of media tiles. Virtualized, so long rails stay cheap. */
export function MediaRail({ items, width, aspect, onPress, cta, showDelta, showDate, inset = 24 }: MediaRailProps) {
  const gap = 12;
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + gap}
      decelerationRate="fast"
      style={{ marginHorizontal: -inset, overflow: 'visible' }}
      contentContainerStyle={{ paddingHorizontal: inset, paddingVertical: 6 }}
      ItemSeparatorComponent={() => <View style={{ width: gap }} />}
      initialNumToRender={3}
      windowSize={5}
      renderItem={({ item }) => (
        <MediaTile item={item} width={width} aspect={aspect} onPress={() => onPress(item)} cta={cta} showDelta={showDelta} showDate={showDate} />
      )}
    />
  );
}
