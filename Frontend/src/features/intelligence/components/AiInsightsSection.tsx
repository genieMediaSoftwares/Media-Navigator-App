import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { AnimatedBar } from '@/components/visual/Metrics';
import { colors } from '@/constants/colors';

/** Soft, non-alarming panel for AI states that have no content yet. */
export function AiQuietState({ title, message, progress, onRetry }: { title: string; message: string; progress?: number; onRetry?: () => void }) {
  return (
    <View className="rounded-2xl bg-violet-light p-xl" accessibilityRole="summary">
      <View className="flex-row items-center">
        <Ionicons name="sparkles-outline" size={18} color={colors.violet} />
        <Text className="ml-sm flex-1 text-title text-navy">{title}</Text>
      </View>
      <Text className="mt-sm text-label font-normal text-navy-light">{message}</Text>
      {progress !== undefined ? (
        <View className="mt-lg">
          <AnimatedBar ratio={progress} color={colors.violet} track={colors.white} />
        </View>
      ) : null}
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" className="mt-sm min-h-11 justify-center self-start">
          <Text className="text-label font-bold text-violet">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
