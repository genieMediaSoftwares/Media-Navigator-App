import { Text, View } from 'react-native';

import { MediaNavigatorLogo } from './brand/MediaNavigatorLogo';

/** Logo + page title block used at the top of the authentication screens. */
export function BrandHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="mb-2xl">
      <MediaNavigatorLogo height={32} />
      <Text className="mt-2xl text-display text-navy" accessibilityRole="header">
        {title}
      </Text>
      <Text className="mt-sm text-body text-neutral-500">{subtitle}</Text>
    </View>
  );
}
