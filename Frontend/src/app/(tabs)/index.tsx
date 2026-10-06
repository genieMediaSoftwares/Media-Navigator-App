import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MediaNavigatorLogo } from '@/components/brand/MediaNavigatorLogo';
import { colors } from '@/constants/colors';
import { fetchConnectedAccounts } from '@/features/accounts/api';
import { useAuth } from '@/features/auth/auth-context';
import { HomeContent } from '@/features/home/components/HomeContent';
import { useApiResource } from '@/hooks/useApiResource';

/**
 * Dashboard: the entry point. Choose a platform, connect it, or enter its analysis. Connection state
 * comes from GET /api/accounts; nothing here is enabled until the backend reports an account.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const { state: auth } = useAuth();
  const { state, refreshing, reload, refresh } = useApiResource(fetchConnectedAccounts);

  // Returning from a connect flow must show the new connection.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const displayName = auth.status === 'authenticated' ? auth.user.profile?.displayName : undefined;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        contentContainerClassName="px-md pb-3xl pt-sm"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View className="mb-lg flex-row items-center justify-between px-xs">
          <MediaNavigatorLogo height={40} />
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={() => router.push('/notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={4}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-neutral-100"
            >
              <Ionicons name="notifications-outline" size={24} color={colors.navy} />
            </Pressable>
            <Pressable
              onPress={() => router.navigate('/profile')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={4}
              className="h-11 w-11 items-center justify-center rounded-full bg-sky active:bg-sky-border"
            >
              <Ionicons name="settings-sharp" size={20} color={colors.navy} />
            </Pressable>
          </View>
        </View>

        <View className="mb-lg px-xs">
          <Text className="text-[13px] text-neutral-500" numberOfLines={1}>
            {displayName ? `Welcome back, ${displayName} 👋` : 'Welcome back 👋'}
          </Text>
          <Text className="mt-0.5 text-[24px] font-extrabold leading-[30px] text-navy" accessibilityRole="header">
            Analyze. Improve. Grow.
          </Text>
          <Text className="mt-xs text-[13px] leading-[19px] text-neutral-500">
            Connect your social media accounts to get AI-powered insights, track performance and discover new ideas.
          </Text>
        </View>

        <HomeContent state={state} onRetry={reload} />
      </ScrollView>
    </SafeAreaView>
  );
}
