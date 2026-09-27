import { AsyncContent } from '@/components/AsyncContent';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { TabScreen } from '@/components/TabScreen';
import { fetchPlannerInsights } from '@/features/planner/api';
import { PlannerContent } from '@/features/planner/components/PlannerContent';
import { useApiResource } from '@/hooks/useApiResource';

export default function PlannerScreen() {
  const { state, refreshing, reload, refresh } = useApiResource(fetchPlannerInsights);
  const loaded = state.status === 'success' ? state.data : null;

  return (
    <TabScreen title="Publishing Planner" subtitle="Find the best times to publish." refreshing={refreshing} onRefresh={refresh}>
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
