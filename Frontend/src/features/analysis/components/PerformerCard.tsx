import { Pressable, Text, View } from 'react-native';

import { MediaThumb } from '@/features/intelligence/components/MediaThumb';
import { formatLabel } from '@/features/intelligence/labels';
import { formatDate, NOT_AVAILABLE } from '@/lib/format';
import { PerformerItem, PerformerType } from '@/types/analysis';
import { SocialPlatform } from '@/types/api';

import { ChipButton, DiffChip, num, pctOrNull, ScoreBadge } from './Primitives';

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="mb-sm w-1/3" accessible accessibilityLabel={`${label}: ${value ?? NOT_AVAILABLE}`}>
      <Text className={value === null ? 'text-caption text-neutral-400' : 'text-label font-bold text-navy'} numberOfLines={1}>
        {value ?? 'N/A'}
      </Text>
      <Text className="text-caption text-neutral-500">{label}</Text>
    </View>
  );
}

interface PerformerCardProps {
  item: PerformerItem;
  type: PerformerType;
  rank: number;
  platform: SocialPlatform;
  onOpen: () => void;
  onWhy: () => void;
  onVideo: () => void;
}

/**
 * One scored post: preview, caption, date, all six metrics (N/A = not provided by the platform),
 * engagement rate and score, then the actions that lead to deeper analysis.
 */
export function PerformerCard({ item, type, rank, platform, onOpen, onWhy, onVideo }: PerformerCardProps) {
  const { post } = item;
  const m = post.metrics;
  const format = formatLabel(post.format, platform);
  const firstReason = item.reasons[0]?.statement ?? null;

  return (
    <View className="mb-lg rounded-xl border border-neutral-100 bg-white p-md">
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${format.singular} ranked ${rank}, score ${post.score ?? 'not available'}`} className="flex-row active:opacity-80">
        <View>
          <MediaThumb uri={post.previewUrl} format={post.format} size={84} rounded="lg" />
          <View className="absolute left-xs top-xs rounded-full bg-navy px-sm py-0.5">
            <Text className="text-caption font-bold text-white">#{rank}</Text>
          </View>
        </View>
        <View className="ml-md flex-1">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-sm">
              <Text className="text-caption text-neutral-500">
                {format.singular}
                {post.publishedAt ? ` · ${formatDate(post.publishedAt)}` : ''}
              </Text>
              <Text className="mt-0.5 text-label text-navy" numberOfLines={2}>
                {post.caption ?? 'No caption'}
              </Text>
            </View>
            <ScoreBadge score={post.score} size="sm" />
          </View>
          {type === 'improve' ? (
            <View className="mt-xs flex-row flex-wrap">
              <DiffChip percent={item.vsAccount.viewsPercent} label="views vs typical" />
            </View>
          ) : null}
        </View>
      </Pressable>

      <View className="mt-md flex-row flex-wrap">
        <Stat label="Views" value={num(m.views)} />
        <Stat label="Likes" value={num(m.likes)} />
        <Stat label="Comments" value={num(m.comments)} />
        <Stat label="Shares" value={num(m.shares)} />
        <Stat label="Saves" value={num(m.saves)} />
        <Stat label="Engagement" value={pctOrNull(post.engagementRate)} />
      </View>

      {firstReason ? (
        <Text className="text-caption text-neutral-500" numberOfLines={2}>
          {firstReason}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap">
        <ChipButton label={type === 'top' ? 'Why it’s top' : 'Why it needs improvement'} icon={type === 'top' ? 'trophy-outline' : 'help-circle-outline'} onPress={onWhy} accent />
        {item.isVideo ? <ChipButton label="Deep video analysis" icon="film-outline" onPress={onVideo} /> : null}
      </View>
    </View>
  );
}
