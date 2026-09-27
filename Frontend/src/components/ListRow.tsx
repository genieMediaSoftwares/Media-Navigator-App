import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

interface ListRowProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  /** Shown instead of the chevron when there is no action, e.g. "Not available yet". */
  status?: string;
}

/** Settings-style row. Rows without onPress render as informational and are not focusable as buttons. */
export function ListRow({ icon, label, onPress, status }: ListRowProps) {
  const content = (
    <>
      <Ionicons name={icon} size={22} color={onPress ? colors.navy : colors.neutral400} />
      <Text className={`ml-lg flex-1 text-body ${onPress ? 'text-navy' : 'text-neutral-500'}`}>{label}</Text>
      {status ? <Text className="ml-md text-caption text-neutral-500">{status}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.neutral400} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View className="min-h-14 flex-row items-center px-lg" accessible accessibilityLabel={[label, status].filter(Boolean).join(', ')}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-14 flex-row items-center px-lg active:bg-neutral-50"
    >
      {content}
    </Pressable>
  );
}
