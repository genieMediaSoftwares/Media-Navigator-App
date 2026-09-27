import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Small uppercase eyebrow, optionally with an icon. Used to name sections and hero areas. */
export function Overline({ children, icon, color = colors.neutral500, className = '' }: { children: ReactNode; icon?: IconName; color?: string; className?: string }) {
  return (
    <View className={`flex-row items-center ${className}`}>
      {icon ? <Ionicons name={icon} size={13} color={color} style={{ marginRight: 5 }} /> : null}
      <Text className="text-overline uppercase tracking-widest" style={{ color }}>
        {children}
      </Text>
    </View>
  );
}

interface SectionTitleProps {
  eyebrow?: string;
  eyebrowIcon?: IconName;
  eyebrowColor?: string;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

/** Editorial section heading: eyebrow → title → one line of context, with an optional text action. */
export function SectionTitle({ eyebrow, eyebrowIcon, eyebrowColor, title, description, action }: SectionTitleProps) {
  return (
    <View className="mb-lg flex-row items-end">
      <View className="flex-1 pr-md">
        {eyebrow ? <Overline icon={eyebrowIcon} color={eyebrowColor} className="mb-xs">{eyebrow}</Overline> : null}
        <Text className="text-heading text-navy" accessibilityRole="header">
          {title}
        </Text>
        {description ? <Text className="mt-xs text-label font-normal text-neutral-500">{description}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={6} className="min-h-11 flex-row items-center justify-center pl-sm">
          <Text className="text-label font-semibold text-primary">{action.label}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}
