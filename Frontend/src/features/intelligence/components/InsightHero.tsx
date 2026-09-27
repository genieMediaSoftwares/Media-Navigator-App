import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { PressableScale } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { AiInsight } from '@/types/api';

import { FORMAT_LABELS, INSIGHT_LABELS } from '../labels';
import { EvidenceTag } from './Evidence';
import { MediaThumb } from './MediaThumb';

/**
 * Editorial AI callout: gradient hairline border, soft AI tint, headline, the AI's observation and
 * a strip of the real posts/formats it cited as evidence.
 */
export function InsightHero({ insight, onPress, eyebrow = 'AI insight' }: { insight: AiInsight; onPress: () => void; eyebrow?: string }) {
  const label = INSIGHT_LABELS[insight.type];
  const evidencePosts = insight.supportingData.posts.slice(0, 4);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}, ${label.label}: ${insight.title}. ${insight.observation}`}
      accessibilityHint="Opens the insight with its supporting data"
    >
      <Gradient name="ai" style={{ borderRadius: 24, padding: 1.5 }}>
        <Gradient name="aiSoft" style={{ borderRadius: 23, padding: 20 }}>
          <View className="flex-row items-center justify-between">
            <Overline icon="sparkles" color={colors.violet}>
              {`${eyebrow} · ${label.label}`}
            </Overline>
          </View>
          <Text className="mt-md text-heading text-navy">{insight.title}</Text>
          <Text className="mt-sm text-body text-navy-light" numberOfLines={4}>
            {insight.observation}
          </Text>

          {evidencePosts.length > 0 || insight.supportingData.formats.length > 0 ? (
            <View className="mt-lg flex-row items-center">
              {evidencePosts.map((post, i) => (
                <View key={post.id} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 12, borderWidth: 2, borderColor: colors.white }}>
                  <MediaThumb uri={post.previewUrl} format={post.format} size={40} rounded="md" />
                </View>
              ))}
              {insight.supportingData.formats.map((f) => (
                <View key={f.format} className="ml-sm flex-row items-center rounded-full px-sm py-1" style={{ backgroundColor: FORMAT_LABELS[f.format].light }}>
                  <View className="mr-1 h-2 w-2 rounded-full" style={{ backgroundColor: FORMAT_LABELS[f.format].color }} />
                  <Text className="text-caption font-semibold text-navy">{FORMAT_LABELS[f.format].plural}</Text>
                </View>
              ))}
              <Text className="ml-sm flex-1 text-caption text-neutral-500" numberOfLines={1}>
                evidence
              </Text>
            </View>
          ) : null}

          <View className="mt-lg flex-row items-center justify-between">
            <EvidenceTag kind="aiSummary" />
            <View className="flex-row items-center">
              <Text className="text-label font-bold text-violet">Explore</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.violet} style={{ marginLeft: 4 }} />
            </View>
          </View>
        </Gradient>
      </Gradient>
    </PressableScale>
  );
}
