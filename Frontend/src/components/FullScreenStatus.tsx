import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { colors } from '@/constants/colors';

import { MediaNavigatorLogo } from './brand/MediaNavigatorLogo';
import { ErrorState } from './ErrorState';

/** Branded splash shown while the stored session is checked with the Worker at startup. */
export function SplashView() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-xl">
      <Animated.View entering={FadeIn.duration(300)}>
        <View className="items-center">
          <MediaNavigatorLogo height={48} />
          <Text className="mt-sm text-center text-body text-neutral-500">Social intelligence and performance</Text>
        </View>
      </Animated.View>
      <View className="mt-3xl">
        <ActivityIndicator color={colors.primary} accessibilityLabel="Checking your session" />
      </View>
    </View>
  );
}

interface FullScreenErrorProps {
  title: string;
  message: string;
  onRetry: () => void;
  secondaryAction?: { label: string; onPress: () => void };
}

export function FullScreenError(props: FullScreenErrorProps) {
  return (
    <View className="flex-1 justify-center bg-white px-xl">
      <ErrorState {...props} />
    </View>
  );
}
