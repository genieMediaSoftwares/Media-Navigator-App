import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AsyncContent } from '@/components/AsyncContent';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { TabScreen } from '@/components/TabScreen';
import { IconButton } from '@/components/ui/IconButton';
import { syncAccount } from '@/features/accounts/api';
import { accountHref, platformOption } from '@/features/accounts/platforms';
import { fetchIntelligenceOverview } from '@/features/intelligence/api';
import { IntelligenceContent } from '@/features/intelligence/components/IntelligenceContent';
import { IntelligenceSkeleton } from '@/features/intelligence/components/IntelligenceSkeleton';
import { SyncState, SyncStatus } from '@/features/intelligence/components/SyncStatus';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { ApiError } from '@/lib/api/client';
import { MetricDefinitions } from '@/types/api';

export default function IntelligenceScreen() {
  const router = useRouter();
  // An account screen can open Intelligence on a specific account; otherwise the server picks the default.
  const params = useLocalSearchParams<{ accountId?: string }>();
  const [accountId, setAccountId] = useState<string | null>(params.accountId || null);
  const fetcher = useCallback(() => fetchIntelligenceOverview(accountId), [accountId]);
  const { state, refreshing, reload, refresh } = useApiResource(fetcher);
  const [sync, setSync] = useState<SyncState>({ status: 'idle' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [definitions, setDefinitions] = useState<MetricDefinitions | null>(null);

  const overview = state.status === 'success' ? state.data.overview : null;
  const platform = platformOption(overview?.account.platform ?? 'instagram');

  const runSync = useCallback(async () => {
    if (!overview) return;
    const id = overview.account.id;
    setSync({ status: 'syncing' });
    try {
      const summary = await syncAccount(id);
      intelligenceSession.clearAccount(id);
      setSync({ status: 'done', postsSynced: summary.postsSynced });
      await refresh();
    } catch (error) {
      setSync({
        status: 'error',
        code: error instanceof ApiError ? error.code : undefined,
        message: error instanceof Error ? error.message : `${platform.name} sync failed.`,
      });
    }
  }, [overview, refresh, platform.name]);

  const closeMenuThen = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <TabScreen
      showLogo
      title="Intelligence"
      headerRight={overview ? <IconButton icon="ellipsis-horizontal" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} /> : undefined}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <SyncStatus
        state={sync}
        onRetry={() => void runSync()}
        onReconnect={() => router.push(accountHref(platform.id))}
        onDismiss={() => setSync({ status: 'idle' })}
        platformName={platform.name}
      />

      <AsyncContent
        state={state}
        onRetry={reload}
        loading={<IntelligenceSkeleton />}
        unavailable={{ icon: 'bulb-outline', title: 'Intelligence isn’t available yet.' }}
        isEmpty={(data) => data.overview === null}
        empty={
          <EmptyState
            icon="logo-instagram"
            title="Connect Instagram"
            message="Connect your Instagram Business or Creator account to see what’s working, what needs attention, and ask questions about your performance."
            action={{ label: 'Connect Instagram', onPress: () => router.push('/connect/instagram') }}
          />
        }
      >
        {(data) =>
          data.overview ? (
            <IntelligenceContent
              overview={data.overview}
              accounts={data.accounts}
              onSelectAccount={setAccountId}
              onSync={() => void runSync()}
              syncing={sync.status === 'syncing'}
              onExplain={() => setDefinitions(data.overview?.definitions ?? null)}
            />
          ) : null
        }
      </AsyncContent>

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Intelligence">
        <View className="-mx-lg">
          <ListRow icon="refresh-outline" label="Sync now" onPress={closeMenuThen(() => void runSync())} />
          <ListRow
            icon="grid-outline"
            label="Content library"
            onPress={closeMenuThen(() => overview && router.push({ pathname: '/intelligence/library', params: { accountId: overview.account.id } }))}
          />
          <ListRow
            icon="chatbubble-ellipses-outline"
            label="Ask Media Navigator"
            onPress={closeMenuThen(() => overview && router.push({ pathname: '/intelligence/ask', params: { accountId: overview.account.id } }))}
          />
          <ListRow icon="information-circle-outline" label="How metrics are calculated" onPress={closeMenuThen(() => setDefinitions(overview?.definitions ?? null))} />
          <ListRow icon={platform.icon} label={`Manage ${platform.name} connection`} onPress={closeMenuThen(() => router.push(accountHref(platform.id)))} />
        </View>
      </BottomSheet>

      <BottomSheet visible={definitions !== null} onClose={() => setDefinitions(null)} title="How metrics are calculated">
        {definitions
          ? (
              [
                ['Interactions', definitions.interactions],
                ['Engagement rate', definitions.engagementRate],
                ['Account average (baseline)', definitions.baseline],
                ['vs account average', definitions.vsBaseline],
                ['Views', definitions.views],
                ['Needs attention', definitions.needsAttention],
                ['Which posts each number covers', definitions.populations],
              ] as const
            ).map(([title, body]) => (
              <View key={title} className="mb-lg">
                <Text className="text-label font-semibold text-navy">{title}</Text>
                <Text className="mt-xs text-label font-normal text-neutral-500">{body}</Text>
              </View>
            ))
          : null}
        <Text className="text-caption text-neutral-500">“Not available” means {platform.name} did not provide that metric. It is never shown as zero.</Text>
      </BottomSheet>
    </TabScreen>
  );
}
