import { ActivityIndicator, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

/** Spinner with a short description, e.g. "Loading insights…". Use Skeletons for known layouts. */
export function LoadingState({ message }: { message: string }) {
  return (
    <View className="items-center py-3xl" accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={colors.primary} />
      <Text className="mt-md text-label font-normal text-neutral-500">{message}</Text>
    </View>
  );
}
