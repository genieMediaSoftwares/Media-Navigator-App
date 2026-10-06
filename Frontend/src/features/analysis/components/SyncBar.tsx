import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { syncAccount } from '@/features/accounts/api';
import { describeIntelligenceError } from '@/features/intelligence/labels';
import { ApiError } from '@/lib/api/client';
import { formatRelativeTime } from '@/lib/format';
import { SyncStatusSummary } from '@/types/analysis';
import { SyncSummary } from '@/types/api';

type LocalState = { status: 'idle' } | { status: 'syncing' } | { status: 'done'; summary: SyncSummary } | { status: 'error'; code?: string; message: string };

interface SyncBarProps {
  accountId: string;
  platformName: string;
  sync: SyncStatusSummary | undefined;
  /** Called after a sync request finishes (success or partial) so the screen reloads real data. */
  onSynced: () => void;
  onReconnect?: () => void;
}

/**
 * One line of sync truth: when data was last synced, how many posts are stored, and the state of
 * the last run (completed, partial, failed). Results come from the server; nothing is simulated.
 */
export function SyncBar({ accountId, platformName, sync, onSynced, onReconnect }: SyncBarProps) {
  const [local, setLocal] = useState<LocalState>({ status: 'idle' });

  const run = async () => {
    setLocal({ status: 'syncing' });
    try {
      const summary = await syncAccount(accountId);
      setLocal({ status: 'done', summary });
      onSynced();
    } catch (error) {
      setLocal({ status: 'error', code: error instanceof ApiError ? error.code : undefined, message: error instanceof Error ? error.message : 'Sync failed.' });
    }
  };

  const syncing = local.status === 'syncing' || sync?.state === 'syncing';
  const partial = local.status === 'done' ? local.summary.status === 'partial' : local.status === 'idle' && sync?.state === 'partial';
  const failed = local.status === 'error' || (local.status === 'idle' && sync?.state === 'failed');

  let title: string;
  let detail: string;
  if (syncing) {
    title = `Syncing ${platformName}…`;
    detail = 'Fetching new posts and the latest metrics. Large accounts can take a minute.';
  } else if (local.status === 'done') {
    const s = local.summary;
    title = partial ? 'Sync partially completed' : 'Sync complete';
    detail = `${s.postsSynced.toLocaleString()} posts checked${s.newPosts ? ` · ${s.newPosts} new` : ''}${partial && s.message ? ` · ${s.message}` : ''}`;
  } else if (local.status === 'error') {
    const copy = describeIntelligenceError(local.code, local.message, platformName);
    title = local.code === 'SYNC_IN_PROGRESS' ? 'Already syncing' : copy.title;
    detail = local.code === 'SYNC_IN_PROGRESS' ? local.message : copy.message;
  } else if (!sync || sync.state === 'never') {
    title = 'Not synced yet';
    detail = `Sync to bring in your ${platformName} posts and metrics.`;
  } else {
    title = `Synced ${formatRelativeTime(sync.lastSyncedAt)}`;
    const reported = sync.profileMediaCount !== null && sync.profileMediaCount !== sync.storedCount ? ` of ${sync.profileMediaCount.toLocaleString()} reported` : '';
    detail = `${sync.storedCount.toLocaleString()} posts${reported}${sync.autoSyncIntervalMs ? ` · auto-sync every ${Math.round(sync.autoSyncIntervalMs / 3_600_000)}h` : ''}`;
    if (partial) {
      title = `Partial sync ${formatRelativeTime(sync.lastSyncedAt)}`;
      detail = sync.lastRun?.errorMessage ?? detail;
    }
    if (failed) {
      title = 'Last sync failed';
      detail = sync.lastRun?.errorMessage ?? 'Try syncing again.';
    }
  }

  const tone = syncing ? 'sync' : failed ? 'error' : partial ? 'warn' : local.status === 'done' ? 'ok' : 'idle';
  const bg = { sync: 'bg-sky', error: 'bg-danger-light', warn: 'bg-warning-light', ok: 'bg-success-light', idle: 'bg-neutral-50' }[tone];
  const icon = { error: 'alert-circle-outline', warn: 'warning-outline', ok: 'checkmark-circle', idle: 'cloud-done-outline', sync: 'sync' }[tone] as 'sync';
  const iconColor = { error: colors.danger, warn: colors.warning, ok: colors.success, idle: colors.neutral500, sync: colors.primary }[tone];
  const reconnect = local.status === 'error' && describeIntelligenceError(local.code, '', platformName).reconnect;

  return (
    <View className={`mb-xl rounded-xl px-lg py-md ${bg}`} accessibilityLiveRegion="polite" accessibilityRole={failed ? 'alert' : 'summary'}>
      <View className="flex-row items-center">
        {syncing ? <ActivityIndicator color={colors.primary} /> : <Ionicons name={icon} size={20} color={iconColor} />}
        <View className="ml-md flex-1">
          <Text className="text-label font-semibold text-navy">{title}</Text>
          <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={3}>
            {detail}
          </Text>
        </View>
        {!syncing ? (
          <Pressable
            onPress={reconnect && onReconnect ? onReconnect : () => void run()}
            accessibilityRole="button"
            accessibilityLabel={reconnect ? `Reconnect ${platformName}` : 'Sync now'}
            className="ml-sm min-h-11 justify-center rounded-full bg-white px-md active:opacity-70"
          >
            <Text className="text-label font-semibold text-primary">{reconnect ? 'Reconnect' : failed ? 'Retry' : 'Sync'}</Text>
          </Pressable>
        ) : null}
      </View>
      {!syncing && local.status === 'idle' && sync?.notes.length ? (
        <Text className="mt-sm text-caption text-neutral-500">{sync.notes.filter((n) => n !== sync.lastRun?.errorMessage).join(' ')}</Text>
      ) : null}
    </View>
  );
}
