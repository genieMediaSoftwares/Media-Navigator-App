import { Text, View } from 'react-native';

import { ContentFormat } from '@/types/api';

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
