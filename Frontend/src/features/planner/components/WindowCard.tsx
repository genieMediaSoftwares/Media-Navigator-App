import { Text, View } from 'react-native';

import { AnimatedBar } from '@/components/visual/Metrics';
import { colors } from '@/constants/colors';
import { formatHour } from '@/lib/format';
import { PublishingWindow } from '@/types/api';

/** A measured publishing window as a timeline row: time on the left, relative strength and the real rationale. */
export function WindowCard({ window, index, isBest }: { window: PublishingWindow; index: number; isBest: boolean }) {
  return (
    <View
      className="mb-lg flex-row"
      accessible
      accessibilityLabel={`${formatHour(window.startHour)} to ${formatHour(window.endHour)}, relative score ${Math.round(window.score)} out of 100. ${window.rationale ?? ''}`}
    >
      <View className="w-16 items-start">
        <Text className="text-title text-navy">{formatHour(window.startHour)}</Text>
        <Text className="text-caption text-neutral-500">to {formatHour(window.endHour)}</Text>
      </View>
      <View className="mr-md items-center">
        <View className={`h-3 w-3 rounded-full ${isBest ? 'bg-violet' : 'bg-violet-border'}`} />
        <View className="w-px flex-1 bg-neutral-200" />
      </View>
      <View className="flex-1 pb-sm">
        <View className="mb-xs flex-row items-center justify-between">
          <Text className="text-label font-semibold text-navy">{isBest ? 'Strongest measured window' : `Window ${index + 1}`}</Text>
          <Text className="text-caption font-semibold text-violet">{Math.round(window.score)}/100</Text>
        </View>
        <AnimatedBar ratio={window.score / 100} color={colors.violet} height={6} />
        {window.rationale ? <Text className="mt-sm text-caption text-neutral-500">{window.rationale}</Text> : null}
      </View>
    </View>
  );
}
