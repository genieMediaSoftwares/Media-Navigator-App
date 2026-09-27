import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { colors } from '@/constants/colors';

import { Button } from './ui/Button';
import { Gradient } from './visual/Gradient';

interface EmptyStateProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
  /** Tighter spacing for use inside a section rather than as a whole screen. */
  compact?: boolean;
}

/** Shown wherever real data does not exist (yet). Never pair it with placeholder content. */
export function EmptyState({ icon, title, message, action, compact = false }: EmptyStateProps) {
  return (
    <View className={`items-center px-lg ${compact ? 'py-xl' : 'py-3xl'}`}>
      <Gradient name="aiSoft" style={{ width: compact ? 64 : 88, height: compact ? 64 : 88, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
        <View className="items-center justify-center rounded-full bg-white" style={{ width: compact ? 44 : 60, height: compact ? 44 : 60 }}>
          <Ionicons name={icon} size={compact ? 22 : 28} color={colors.violet} />
        </View>
      </Gradient>
      <Text className={`mt-xl text-center text-navy ${compact ? 'text-title' : 'text-heading'}`}>{title}</Text>
      <Text className="mt-sm max-w-80 text-center text-body text-neutral-500">{message}</Text>
      {action ? (
        <View className="mt-xl self-stretch">
          <Button title={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}
