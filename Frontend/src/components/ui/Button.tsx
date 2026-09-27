import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { buttonSizes, buttonVariants } from '@/constants/variants';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  const styles = buttonVariants[variant];
  const sizing = buttonSizes[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      className={`flex-row items-center justify-center rounded-lg ${sizing.container} ${styles.container} ${inactive ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={styles.spinner} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={sizing.icon} color={styles.spinner} style={{ marginRight: 8 }} /> : null}
          <Text className={`${sizing.text} ${styles.text}`} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
