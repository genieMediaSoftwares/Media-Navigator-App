import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { PlatformCard } from '@/components/PlatformCard';
import { Divider } from '@/components/ui/Divider';
import { Notice } from '@/components/ui/Notice';
import { colors } from '@/constants/colors';
import { disconnectAccount, fetchConnectedAccounts } from '@/features/accounts/api';
import { accountHref, PLATFORMS } from '@/features/accounts/platforms';
import { useApiResource } from '@/hooks/useApiResource';
import { ConnectedAccount, SocialPlatform } from '@/types/api';

export default function ConnectedAccountsScreen() {
  const router = useRouter();
  const { state, refreshing, reload, refresh } = useApiResource(fetchConnectedAccounts);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Automatically refresh accounts when returning to this screen
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleDisconnect = useCallback(
    (account: ConnectedAccount) => {
      Alert.alert(
        'Disconnect Account',
        `Are you sure you want to disconnect @${account.handle}? Media Navigator will stop sync for this account.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              setDisconnectingId(account.id);
              try {
                await disconnectAccount(account.id);
                await reload();
              } catch (error) {
                Alert.alert(
                  'Unable to disconnect account',
                  error instanceof Error ? error.message : 'Please try again.',
                );
              } finally {
                setDisconnectingId(null);
              }
            },
          },
        ],
      );
    },
    [reload],
  );

  // Each platform has its own screen: the connect flow when not connected, the account when connected.
  const handleAction = (platformId: SocialPlatform) => router.push(accountHref(platformId));

  const connectionFor = (platform: string): ConnectedAccount | null | undefined =>
    state.status === 'success' ? (state.data.find((account) => account.platform === platform) ?? null) : undefined;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-xl pb-3xl pt-lg"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <Text className="mb-xl text-body text-neutral-500">
        Manage the social media platforms connected to Media Navigator. Tapping Connect takes you to a dedicated connection screen.
      </Text>

      {state.status === 'loading' ? <LoadingState message="Loading account data…" /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={reload} /> : null}
      {state.status === 'unavailable' ? <Notice variant="info" title="Not available yet" message={state.message} /> : null}

      {state.status !== 'loading' && state.status !== 'error' ? (
        <View className="rounded-lg border border-neutral-200 px-lg">
          {PLATFORMS.map((platform, index) => {
            const conn = connectionFor(platform.id);
            return (
              <View key={platform.id}>
                {index > 0 ? <Divider /> : null}
                <PlatformCard
                  platform={platform}
                  connection={conn}
                  onConnect={() => handleAction(platform.id)}
                  onManage={() => handleAction(platform.id)}
                  onDisconnect={conn ? () => handleDisconnect(conn) : undefined}
                  disconnecting={conn ? disconnectingId === conn.id : false}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}
