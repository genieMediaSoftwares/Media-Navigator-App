import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { AsyncContent } from '@/components/AsyncContent';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { TabScreen } from '@/components/TabScreen';
import { colors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { fetchPlannerInsights } from '@/features/planner/api';
import { PlannerContent } from '@/features/planner/components/PlannerContent';
import { useApiResource } from '@/hooks/useApiResource';
import { IntelligenceAccount } from '@/types/api';

/** Account chips, shown only when more than one account is connected. */
function AccountChips({ accounts, selectedId, onSelect }: { accounts: IntelligenceAccount[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-xl" contentContainerClassName="px-xl" accessibilityRole="tablist">
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        const platform = platformOption(account.platform);
        return (
          <Pressable
            key={account.id}
            onPress={() => onSelect(account.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${platform.name} @${account.handle}`}
            className={`mr-sm min-h-10 flex-row items-center rounded-full px-lg ${selected ? 'bg-navy' : 'bg-neutral-100'}`}
          >
            <Ionicons name={platform.icon} size={15} color={selected ? colors.white : colors.navy} style={{ marginRight: 6 }} />
            <Text className={`text-label ${selected ? 'font-semibold text-white' : 'text-navy'}`}>@{account.handle}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function PlannerScreen() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const fetcher = useCallback(() => fetchPlannerInsights(accountId), [accountId]);
  const { state, refreshing, reload, refresh } = useApiResource(fetcher);
  const loaded = state.status === 'success' ? state.data : null;
  const accounts = loaded?.accounts ?? [];

  return (
    <TabScreen title="Publishing Planner" subtitle="Find the best times to publish from your own history." refreshing={refreshing} onRefresh={refresh}>
      {accounts.length > 1 ? <AccountChips accounts={accounts} selectedId={loaded?.account?.id ?? null} onSelect={setAccountId} /> : null}
      <AsyncContent
        state={state}
        onRetry={reload}
        loading={<LoadingState message="Loading publishing data…" />}
        unavailable={{ icon: 'calendar-outline', title: 'No publishing insights available yet.' }}
        isEmpty={(insights) => insights.heatmap.length === 0 && insights.recommendedWindows.length === 0}
        empty={
          <EmptyState
            icon="calendar-outline"
            title="Not enough historical data yet"
            message={
              loaded
                ? `Timing patterns appear after ${loaded.minimumRequired} posts with engagement data (${loaded.postsAnalyzed} synced so far). They are measured from your history, never estimated.`
                : 'Timing patterns appear once your account has enough publishing history.'
            }
          />
        }
      >
        {(insights) => <PlannerContent insights={insights} />}
      </AsyncContent>
    </TabScreen>
  );
}
