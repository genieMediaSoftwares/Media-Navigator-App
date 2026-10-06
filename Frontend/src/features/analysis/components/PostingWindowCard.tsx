import { Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { PostingRecommendation } from '@/types/analysis';

import { ConfidenceMeter } from './Primitives';

/**
 * The measured recommendation: best day, best time, which metrics are strong there, how confident
 * the measurement is, and why. Shows the "not enough history" state instead of a generic tip.
 */
export function PostingWindowCard({ recommendation, showWhy = true }: { recommendation: PostingRecommendation; showWhy?: boolean }) {
  const r = recommendation;
  if (!r.sufficient || (!r.bestDay && !r.bestTime)) {
    return (
      <View className="rounded-xl bg-neutral-50 p-lg">
        <Text className="text-label font-semibold text-navy">Not enough history for a timing recommendation</Text>
        <Text className="mt-xs text-caption text-neutral-500">
          Needs {r.minimumRequired} posts older than 3 days with metrics ({r.postsAnalyzed} so far). Recommendations are measured from your own posts, never generic.
        </Text>
      </View>
    );
  }
  return (
    <View>
      <View style={elevation.float}>
        <Gradient name="brand" style={{ borderRadius: 20, padding: 20 }}>
          <Overline icon="time-outline" color={colors.onDarkMuted}>
            When to post
          </Overline>
          <View className="mt-md flex-row">
            {r.bestDay ? (
              <View className="flex-1">
                <Text className="text-caption" style={{ color: colors.onDarkMuted }}>
                  Best day
                </Text>
                <Text className="text-heading text-white">{r.bestDay.label}</Text>
              </View>
            ) : null}
            {r.bestTime ? (
              <View className="flex-1">
                <Text className="text-caption" style={{ color: colors.onDarkMuted }}>
                  Best time
                </Text>
                <Text className="text-heading text-white">{r.bestTime.label}</Text>
              </View>
            ) : null}
          </View>
          {r.strongMetrics.length > 0 ? (
            <Text className="mt-md text-label text-white">Strong for: {r.strongMetrics.join(', ')}</Text>
          ) : null}
          <View className="mt-md">
            <ConfidenceMeter confidence={r.confidence} onDark />
          </View>
          <Text className="mt-xs text-caption" style={{ color: colors.onDarkMuted }}>
            {r.postsAnalyzed} posts · times in {r.timezone}
          </Text>
        </Gradient>
      </View>
      {showWhy && r.why.length > 0 ? (
        <View className="mt-lg">
          <Text className="mb-xs text-label font-semibold text-navy">Why this time</Text>
          {r.why.map((line) => (
            <Text key={line} className="mb-xs text-label font-normal text-navy-light">
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
