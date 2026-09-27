import { Pressable, Text, View } from 'react-native';

import { AnimatedBar } from '@/components/visual/Metrics';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { ContentFormat, FormatPerformance } from '@/types/api';

import { FORMAT_LABELS } from '../labels';

/** Publishing mix: one segmented bar whose segments are the real share of each format. */
export function FormatMix({ counts }: { counts: { format: ContentFormat; count: number }[] }) {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;
  return (
    <View accessible accessibilityLabel={`Publishing mix: ${counts.map((c) => `${c.count} ${FORMAT_LABELS[c.format].plural}`).join(', ')}`}>
      <View className="h-3 flex-row overflow-hidden rounded-full">
        {counts.map((c) => (
          <View key={c.format} style={{ flex: c.count, backgroundColor: FORMAT_LABELS[c.format].color, marginRight: 2 }} />
        ))}
      </View>
      <View className="mt-sm flex-row flex-wrap">
        {counts.map((c) => (
          <View key={c.format} className="mb-xs mr-lg flex-row items-center">
            <View className="mr-xs h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FORMAT_LABELS[c.format].color }} />
            <Text className="text-caption text-neutral-500">
              <Text className="font-semibold text-navy">{c.count}</Text> {FORMAT_LABELS[c.format][c.count === 1 ? 'singular' : 'plural'].toLowerCase()}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Formats ranked by average interactions per post, each with its own color, an animated bar and
 * inline secondary metrics. Unavailable metrics say so rather than showing a number.
 */
export function FormatComparison({ formats, onPressFormat }: { formats: FormatPerformance[]; onPressFormat?: (format: ContentFormat) => void }) {
  const ranked = [...formats].sort((a, b) => (b.avgInteractions ?? -1) - (a.avgInteractions ?? -1));
  const max = Math.max(0, ...ranked.map((f) => f.avgInteractions ?? 0));

  return (
    <View>
      {ranked.map((format, index) => {
        const label = FORMAT_LABELS[format.format];
        const secondary = [
          format.avgViews !== null ? `${formatCompactNumber(format.avgViews)} avg views` : 'Views not available',
          format.avgEngagementRate !== null ? `${formatPercent(format.avgEngagementRate, 2)} engagement` : 'Engagement not available',
        ];
        const a11y = `${label.plural}, ${format.count} items: ${
          format.avgInteractions !== null ? `${formatCompactNumber(format.avgInteractions)} average interactions` : 'interactions not available'
        }. ${secondary.join('. ')}`;
        const body = (
          <>
            <View className="flex-row items-end justify-between">
              <View className="flex-row items-center">
                <View className="mr-sm h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: label.light }}>
                  <Text className="text-caption font-bold" style={{ color: label.color }}>
                    {index + 1}
                  </Text>
                </View>
                <View>
                  <Text className="text-title text-navy">{label.plural}</Text>
                  <Text className="text-caption text-neutral-500">{format.count} published</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-heading" style={{ color: format.avgInteractions !== null ? label.color : undefined }}>
                  {format.avgInteractions !== null ? formatCompactNumber(format.avgInteractions) : '—'}
                </Text>
                <Text className="text-caption text-neutral-500">avg interactions</Text>
              </View>
            </View>
            <View className="mt-md">
              <AnimatedBar ratio={max > 0 && format.avgInteractions !== null ? format.avgInteractions / max : 0} color={label.color} height={10} />
            </View>
            <Text className="mt-sm text-caption text-neutral-500">{secondary.join('  ·  ')}</Text>
          </>
        );
        return onPressFormat ? (
          <Pressable key={format.format} onPress={() => onPressFormat(format.format)} accessibilityRole="button" accessibilityLabel={a11y} className="py-md active:opacity-80">
            {body}
          </Pressable>
        ) : (
          <View key={format.format} className="py-md" accessible accessibilityLabel={a11y}>
            {body}
          </View>
        );
      })}
    </View>
  );
}
