import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { colors } from '@/constants/colors';

import { Button } from './ui/Button';

interface ErrorStateProps {
  title?: string;
  /** The real error message from the API client. */
  message: string;
  onRetry: () => void;
  secondaryAction?: { label: string; onPress: () => void };
}

/** Calm, actionable failure state: what happened, and one clear way forward. */
export function ErrorState({ title = 'We couldn’t load this', message, onRetry, secondaryAction }: ErrorStateProps) {
  return (
    <View className="items-center px-lg py-3xl" accessibilityRole="alert">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-danger-light">
        <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} />
      </View>
      <Text className="mt-lg text-center text-title text-navy">{title}</Text>
      <Text className="mt-sm max-w-80 text-center text-body text-neutral-500">{message}</Text>
      <View className="mt-xl self-stretch">
        <Button title="Try again" icon="refresh-outline" onPress={onRetry} />
      </View>
      {secondaryAction ? (
        <View className="mt-sm self-stretch">
          <Button title={secondaryAction.label} variant="ghost" onPress={secondaryAction.onPress} />
        </View>
      ) : null}
    </View>
  );
}
