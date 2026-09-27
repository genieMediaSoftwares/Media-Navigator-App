import Ionicons from '@expo/vector-icons/Ionicons';
import { FlatList, Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { AnimatedBar } from '@/components/visual/Metrics';
import { PressableScale } from '@/components/visual/Motion';
import { SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { describeMetric, describeVsAverage, formatCompactNumber, formatDate, formatSignedPercent } from '@/lib/format';
import { IntelligencePost } from '@/types/api';

import { FORMAT_LABELS } from '../labels';
import { MediaThumb } from './MediaThumb';

const ITEM_WIDTH = 172;

/**
 * One below-average post as a vertical diagnosis: thumbnail → date/format → measured gap →
 * interactions vs account average → caption → "View diagnosis".
 */
function Diagnosis({ post, baseline, onPress }: { post: IntelligencePost; baseline: number; onPress: () => void }) {
  const interactions = post.interactions ?? 0;
  const format = FORMAT_LABELS[post.format];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        format.singular,
        post.publishedAt ? formatDate(post.publishedAt) : null,
        post.vsBaselinePercent !== null ? describeVsAverage(post.vsBaselinePercent) : null,
        `${describeMetric(post.interactions, 'interactions')} against an account average of ${formatCompactNumber(baseline)}`,
        post.caption ? post.caption.slice(0, 60) : 'No caption',
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens the diagnosis for this post"
      style={{ width: ITEM_WIDTH }}
    >
      <MediaThumb uri={post.previewUrl} format={post.format} size={ITEM_WIDTH} rounded="xl" />

      <View className="mt-sm flex-row items-center">
        <Text className="text-overline uppercase tracking-widest" style={{ color: format.color }}>
          {format.singular}
        </Text>
        {post.publishedAt ? <Text className="ml-sm text-caption text-neutral-500">{formatDate(post.publishedAt)}</Text> : null}
      </View>

      {post.vsBaselinePercent !== null ? (
        <Text className="mt-xs text-heading text-warning">{formatSignedPercent(post.vsBaselinePercent)}</Text>
      ) : null}
      <Text className="text-caption text-neutral-500">
        <Text className="font-semibold text-navy">{formatCompactNumber(post.interactions)}</Text> vs {formatCompactNumber(baseline)} avg interactions
      </Text>
      <View className="mt-xs">
        <AnimatedBar ratio={baseline > 0 ? Math.min(interactions / baseline, 1) : 0} color={colors.warning} height={5} track={colors.white} />
      </View>

      <Text className="mt-sm text-caption text-navy-light" numberOfLines={2}>
        {post.caption ?? 'No caption'}
      </Text>
      <View className="mt-sm flex-row items-center">
        <Text className="text-label font-bold text-primary">View diagnosis</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
      </View>
    </PressableScale>
  );
}

interface NeedsAttentionProps {
  posts: IntelligencePost[];
  baseline: number | null;
  /** Median interactions per post, shown when the mean is skewed by a few large posts. */
  median: number | null;
  sufficient: boolean;
  onOpen: (post: IntelligencePost) => void;
  onSeeAll: () => void;
}

/**
 * Diagnostic band, not an alarm: a warm full-bleed tint with a rail of measured gaps, each leading
 * to the AI diagnosis (labelled as a hypothesis on the next screen).
 */
export function NeedsAttention({ posts, baseline, median, sufficient, onOpen, onSeeAll }: NeedsAttentionProps) {
  const skewed = baseline !== null && median !== null && baseline > median * 3;
  return (
    <Gradient name="attention" direction="vertical" style={{ marginHorizontal: -24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, marginBottom: 32 }}>
      <SectionTitle
        eyebrow="Needs attention"
        eyebrowIcon="compass-outline"
        eyebrowColor={colors.warning}
        title="Room to improve"
        description="Posts older than 3 days that are below your account average."
        action={sufficient && posts.length > 0 ? { label: 'All', onPress: onSeeAll } : undefined}
      />

      {!sufficient ? (
        <Text className="text-label font-normal text-neutral-500">More content history needed before posts can be compared with your average.</Text>
      ) : posts.length === 0 || baseline === null ? (
        <View className="flex-row items-center">
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text className="ml-sm flex-1 text-label font-normal text-navy">No older posts are below your account average.</Text>
        </View>
      ) : (
        <>
          {skewed ? (
            <View className="-mt-sm mb-lg flex-row items-start" accessible>
              <Ionicons name="information-circle-outline" size={16} color={colors.warning} style={{ marginTop: 1 }} />
              <Text className="ml-xs flex-1 text-caption text-neutral-500">
                Your average ({formatCompactNumber(baseline)}) is lifted by a few high-performing posts. A typical post gets{' '}
                <Text className="font-semibold text-navy">{formatCompactNumber(median)}</Text> interactions (median).
              </Text>
            </View>
          ) : null}
          <FlatList
            horizontal
            data={posts}
            keyExtractor={(post) => post.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_WIDTH + 16}
            decelerationRate="fast"
            style={{ marginHorizontal: -24 }}
            contentContainerStyle={{ paddingHorizontal: 24 }}
            ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
            renderItem={({ item }) => <Diagnosis post={item} baseline={baseline} onPress={() => onOpen(item)} />}
          />
        </>
      )}
    </Gradient>
  );
}
