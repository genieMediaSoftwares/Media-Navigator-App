import { ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';

import { MediaNavigatorLogo } from './brand/MediaNavigatorLogo';

interface TabScreenProps {
  title: string;
  /** Small line above the title, e.g. a greeting. */
  eyebrow?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  /** Show the Media Navigator logo above the title (primary tab screens). */
  showLogo?: boolean;
  /** Pull-to-refresh; pass both to enable it. Refreshing must re-request the real API. */
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}

/** Page shell for the authenticated tab screens: safe area, large title, scrolling, pull-to-refresh. */
export function TabScreen({ title, eyebrow, subtitle, headerRight, showLogo = false, refreshing, onRefresh, children }: TabScreenProps) {
  return (
    // SafeAreaView is a third-party component, so it is styled with `style` rather than className.
    // The tab bar handles the bottom inset.
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        contentContainerClassName="px-xl pb-3xl pt-lg"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          ) : undefined
        }
      >
        {showLogo ? (
          <View className="mb-lg">
            <MediaNavigatorLogo height={38} />
          </View>
        ) : null}
        <View className="mb-xl flex-row items-start">
          <View className="flex-1 pr-md">
            {eyebrow ? (
              <Text className="text-label text-neutral-500" numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text className="text-display text-navy" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text className="mt-xs text-body text-neutral-500">{subtitle}</Text> : null}
          </View>
          {headerRight}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
