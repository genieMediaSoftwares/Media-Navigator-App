import { Pressable, Text, View } from 'react-native';

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <View className="mb-md flex-row items-end">
      <View className="flex-1 pr-md">
        <Text className="text-title text-navy" accessibilityRole="header">
          {title}
        </Text>
        {description ? <Text className="mt-xs text-caption text-neutral-500">{description}</Text> : null}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          className="min-h-11 justify-center rounded-md px-sm active:bg-sky"
        >
          <Text className="text-label font-semibold text-primary">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
