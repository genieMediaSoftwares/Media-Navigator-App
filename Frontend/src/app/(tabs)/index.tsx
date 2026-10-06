import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AsyncContent } from '@/components/AsyncContent';
import { EmptyState } from '@/components/EmptyState';
import { TabScreen } from '@/components/TabScreen';
import { IconButton } from '@/components/ui/IconButton';
import { useAuth } from '@/features/auth/auth-context';
import { fetchHomeOverview } from '@/features/home/api';
import { HomeContent } from '@/features/home/components/HomeContent';
import { HomeSkeleton } from '@/features/home/components/HomeSkeleton';
import { useApiResource } from '@/hooks/useApiResource';

export default function HomeScreen() {
  const router = useRouter();
  const { state: auth } = useAuth();
  const { state, refreshing, reload, refresh } = useApiResource(fetchHomeOverview);
  const openAccounts = () => router.push('/connected-accounts');

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const displayName = auth.status === 'authenticated' ? auth.user.profile?.displayName : undefined;

  return (
    <TabScreen
      showLogo
      eyebrow={displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
      title="Dashboard"
      headerRight={<IconButton icon="notifications-outline" accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} />}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <AsyncContent
        state={state}
        onRetry={reload}
        loading={<HomeSkeleton />}
        unavailable={{ icon: 'link-outline', title: 'No accounts connected yet.', action: { label: 'View platforms', onPress: openAccounts } }}
        isEmpty={(overview) => overview.accounts.length === 0}
        empty={
          <EmptyState
            icon="link-outline"
            title="No accounts connected yet."
            message="Connect your social accounts to start viewing performance insights."
            action={{ label: 'Connect an account', onPress: openAccounts }}
          />
        }
      >
        {(overview) => <HomeContent overview={overview} />}
      </AsyncContent>
    </TabScreen>
  );
}
