import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

import { describeIntelligenceError } from '../labels';

export type SyncState =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'done'; postsSynced: number }
  | { status: 'error'; code?: string; message: string };

interface SyncStatusProps {
  state: SyncState;
  onRetry: () => void;
  onReconnect: () => void;
  onDismiss: () => void;
}

/**
 * Inline sync feedback. The Worker syncs in a single request, so this shows one honest
 * in-progress state (no simulated step-by-step progress) and the real count when it finishes.
 */
export function SyncStatus({ state, onRetry, onReconnect, onDismiss }: SyncStatusProps) {
  if (state.status === 'idle') return null;

  if (state.status === 'syncing') {
    return (
      <View className="mb-xl flex-row items-center rounded-lg bg-sky p-lg" accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessibilityLabel="Syncing Instagram">
        <ActivityIndicator color={colors.primary} />
        <View className="ml-md flex-1">
          <Text className="text-label font-semibold text-navy">Syncing Instagram…</Text>
          <Text className="mt-xs text-caption text-neutral-500">Fetching your profile, media and metrics from Meta.</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'done') {
    return (
      <View className="mb-xl flex-row items-center rounded-lg bg-success-light p-lg" accessibilityRole="summary" accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        <View className="ml-md flex-1">
          <Text className="text-label font-semibold text-success">Sync complete</Text>
          <Text className="mt-xs text-caption text-neutral-500">
            {state.postsSynced} media synchronized · Last synced just now
          </Text>
        </View>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" className="h-11 w-11 items-center justify-center">
          <Ionicons name="close" size={18} color={colors.neutral500} />
        </Pressable>
      </View>
    );
  }

  const copy = describeIntelligenceError(state.code ?? 'SYNC_FAILED', state.message);
  return (
    <View className="mb-xl rounded-lg bg-danger-light p-lg" accessibilityRole="alert">
      <View className="flex-row">
        <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
        <View className="ml-md flex-1">
          <Text className="text-label font-semibold text-danger">{copy.title}</Text>
          <Text className="mt-xs text-caption text-neutral-500">{copy.message}</Text>
        </View>
      </View>
      <View className="mt-sm flex-row justify-end">
        <Pressable onPress={onDismiss} accessibilityRole="button" className="mr-sm min-h-11 justify-center px-md">
          <Text className="text-label font-semibold text-neutral-500">Dismiss</Text>
        </Pressable>
        <Pressable onPress={copy.reconnect ? onReconnect : onRetry} accessibilityRole="button" className="min-h-11 justify-center rounded-md px-md active:bg-white">
          <Text className="text-label font-semibold text-primary">{copy.reconnect ? 'Reconnect Instagram' : 'Try again'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
