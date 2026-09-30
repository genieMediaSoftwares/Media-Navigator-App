import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Divider } from '@/components/ui/Divider';
import { colors } from '@/constants/colors';
import { fetchPendingSelection, selectPendingAccount } from '@/features/accounts/api';
import { accountHref, PLATFORMS, PlatformOption } from '@/features/accounts/platforms';
import { useApiResource } from '@/hooks/useApiResource';
import { PendingAccountOption } from '@/types/api';

type Params = { status?: string; platform?: string; accountId?: string; selectionId?: string; message?: string };

/**
 * Where a platform sign-in returns to (the server redirects here after the OAuth exchange). Shows the
 * real outcome: connected, failed with the server's reason, or a list of accounts to choose from.
 */
export default function OAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const platform = PLATFORMS.find((p) => p.id === params.platform) ?? null;
  const [connectedHandle, setConnectedHandle] = useState<string | null>(null);
  const name = platform?.name ?? 'Account';

  const openAccount = () => (platform ? router.replace(accountHref(platform.id)) : router.replace('/connected-accounts'));

  if (params.status === 'success' || connectedHandle) {
    return (
      <View className="flex-1 bg-white px-xl">
        <EmptyState
          icon="checkmark-circle-outline"
          title={`${name} connected`}
          message={`${connectedHandle ? `@${connectedHandle} is` : 'Your account is'} connected. Media Navigator has started syncing its content and metrics.`}
          action={{ label: 'View account', onPress: openAccount }}
        />
      </View>
    );
  }

  if (params.status === 'select' && params.selectionId && platform) {
    return <SelectionView selectionId={params.selectionId} platform={platform} onConnected={setConnectedHandle} />;
  }

  return (
    <View className="flex-1 bg-white px-xl">
      <EmptyState
        icon="alert-circle-outline"
        title={`Couldn’t connect ${name}`}
        message={params.message || 'The connection was not completed. Please try again.'}
        action={{ label: 'Back to connected accounts', onPress: () => router.replace('/connected-accounts') }}
      />
    </View>
  );
}

function SelectionView({ selectionId, platform, onConnected }: { selectionId: string; platform: PlatformOption; onConnected: (handle: string) => void }) {
  const fetcher = useCallback(() => fetchPendingSelection(selectionId), [selectionId]);
  const { state, reload } = useApiResource(fetcher);
  const [choosing, setChoosing] = useState<string | null>(null);

  const choose = async (option: PendingAccountOption) => {
    setChoosing(option.platformAccountId);
    try {
      const { account } = await selectPendingAccount(selectionId, option.platformAccountId);
      onConnected(account.username);
    } catch (error) {
      Alert.alert(`Unable to connect ${platform.name}`, error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setChoosing(null);
    }
  };

  if (state.status === 'loading') return <LoadingState message="Loading your accounts…" />;
  if (state.status !== 'success') {
    return (
      <View className="flex-1 bg-white p-xl">
        <ErrorState message={state.message} onRetry={reload} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-lg">
      <Text className="text-heading text-navy">Choose what to connect</Text>
      <Text className="mb-xl mt-sm text-body text-neutral-500">
        Your {platform.name} sign-in can access {state.data.options.length} accounts. Choose the one to analyze in Media Navigator.
      </Text>
      <View className="rounded-lg border border-neutral-200 px-lg">
        {state.data.options.map((option, index) => (
          <View key={option.platformAccountId}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => void choose(option)}
              disabled={choosing !== null}
              accessibilityRole="button"
              accessibilityLabel={`Connect ${option.accountName ?? option.accountUsername}`}
              className="min-h-16 flex-row items-center py-md active:bg-neutral-50"
            >
              <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-100">
                {option.profilePictureUrl ? (
                  <Image source={{ uri: option.profilePictureUrl }} style={{ width: 40, height: 40 }} contentFit="cover" />
                ) : (
                  <Ionicons name={platform.icon} size={20} color={colors.navy} />
                )}
              </View>
              <View className="ml-md flex-1">
                <Text className="text-body text-navy">{option.accountName ?? option.accountUsername}</Text>
                <Text className="text-caption text-neutral-500">@{option.accountUsername}</Text>
              </View>
              {choosing === option.platformAccountId ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.neutral400} />
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
