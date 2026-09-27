import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cardVariants } from '@/constants/variants';

interface CardProps {
  children: ReactNode;
  variant?: keyof typeof cardVariants;
  /** Extra layout classes (padding, width, margins). Colors come from the variant. */
  className?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Card({ children, variant = 'outlined', className = '', onPress, accessibilityLabel, accessibilityHint }: CardProps) {
  const classes = `rounded-lg p-lg ${cardVariants[variant]} ${className}`;

  if (!onPress) {
    return (
      <View className={classes} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      className={`${classes} active:opacity-80`}
    >
      {children}
    </Pressable>
  );
}
