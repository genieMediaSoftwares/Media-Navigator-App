import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Pressable } from 'react-native';

import { colors } from '@/constants/colors';

interface IconButtonProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Required: icon-only buttons have no visible text for screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  variant?: 'plain' | 'tinted';
  color?: string;
}

/** 44×44 touch target regardless of icon size. */
export function IconButton({ icon, accessibilityLabel, onPress, variant = 'plain', color = colors.navy }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`h-11 w-11 items-center justify-center rounded-full ${
        variant === 'tinted' ? 'bg-neutral-100 active:bg-neutral-200' : 'active:bg-neutral-100'
      }`}
    >
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}
