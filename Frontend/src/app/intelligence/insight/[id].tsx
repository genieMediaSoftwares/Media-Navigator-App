import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Gradient } from '@/components/visual/Gradient';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { fetchAiInsights } from '@/features/intelligence/api';
import { EvidenceBlock, SupportingDataList } from '@/features/intelligence/components/Evidence';
import { describeIntelligenceError, INSIGHT_LABELS } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { formatRelativeTime } from '@/lib/format';
import { AiInsight } from '@/types/api';

function InsightDetail({ insight, generatedAt, accountId }: { insight: AiInsight; generatedAt: string; accountId: string }) {
  const label = INSIGHT_LABELS[insight.type];
  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-3xl">
      <Gradient name="aiSoft" style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 }}>
        <FadeIn>
          <View className="flex-row items-center">
            <Gradient name="ai" style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={label.icon} size={18} color={colors.white} />
            </Gradient>
            <Overline icon="sparkles" color={colors.violet} className="ml-sm">
              {`AI insight · ${label.label}`}
            </Overline>
          </View>
          <Text className="mt-lg text-display text-navy" accessibilityRole="header">
            {insight.title}
          </Text>
          <Text className="mt-sm text-caption text-neutral-500">Generated {formatRelativeTime(generatedAt).toLowerCase()} from your synced Instagram data</Text>
        </FadeIn>
      </Gradient>

      <View className="px-xl pt-xl">
        <FadeIn index={1}>
          <EvidenceBlock title="Observation" kind="aiSummary">
            {insight.observation}
          </EvidenceBlock>
        </FadeIn>

        <FadeIn index={2}>
          <EvidenceBlock title="Supporting data" kind="observed">
            <Text className="mb-xs text-caption text-neutral-500">These numbers come directly from your synced Instagram data, not from the AI.</Text>
            <SupportingDataList data={insight.supportingData} accountId={accountId} />
          </EvidenceBlock>
        </FadeIn>

        {insight.explanation ? (
          <EvidenceBlock title="Possible explanation" kind="aiHypothesis">
            {insight.explanation}
          </EvidenceBlock>
        ) : null}
        {insight.recommendation ? (
          <EvidenceBlock title="Recommendation" kind="aiSuggestion">
            {insight.recommendation}
          </EvidenceBlock>
        ) : null}
        {insight.expectedMeasurement ? (
          <EvidenceBlock title="What to measure next" kind="aiSuggestion">
            {insight.expectedMeasurement}
          </EvidenceBlock>
        ) : null}

        <Text className="text-caption text-neutral-400">Explanations and recommendations are AI hypotheses, not verified causes.</Text>
      </View>
    </ScrollView>
  );
}

export default function InsightDetailScreen() {
  const { id, accountId = '' } = useLocalSearchParams<{ id: string; accountId?: string }>();
  const cached = intelligenceSession.insights(accountId);
  const cachedInsight = cached?.insights.find((i) => i.id === id);

  if (cached && cachedInsight) return <InsightDetail insight={cachedInsight} generatedAt={cached.generatedAt} accountId={accountId} />;
  return <InsightLoader id={id} accountId={accountId} />;
}

/** Fallback when the screen is opened without the home screen's data (served from the Worker's cache). */
function InsightLoader({ id, accountId }: { id: string; accountId: string }) {
  const fetcher = useCallback(() => fetchAiInsights(accountId), [accountId]);
  const { state, reload } = useApiResource(fetcher);

  if (state.status === 'loading') return <LoadingState message="Loading insight…" />;
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? state.code : undefined, state.message);
    return (
      <View className="flex-1 bg-white p-xl">
        <ErrorState title={copy.title} message={copy.message} onRetry={reload} />
      </View>
    );
  }
  const insight = state.data.insights.find((i) => i.id === id);
  if (!insight) {
    return (
      <View className="flex-1 bg-white p-xl">
        <EmptyState icon="sparkles-outline" title="This insight is no longer available" message="Insights are regenerated after each sync." />
      </View>
    );
  }
  return <InsightDetail insight={insight} generatedAt={state.data.generatedAt} accountId={accountId} />;
}
