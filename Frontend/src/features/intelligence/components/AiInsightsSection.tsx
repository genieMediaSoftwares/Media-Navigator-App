import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { AnimatedBar } from '@/components/visual/Metrics';
import { PressableScale } from '@/components/visual/Motion';
import { SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { useApiResource } from '@/hooks/useApiResource';
import { formatRelativeTime } from '@/lib/format';
import { AiInsight } from '@/types/api';

import { fetchAiInsights } from '../api';
import { describeIntelligenceError, INSIGHT_LABELS } from '../labels';
import { intelligenceSession } from '../session';
import { InsightHero } from './InsightHero';

interface AiInsightsSectionProps {
  accountId: string;
  aiConfigured: boolean;
  rankingSufficient: boolean;
  minimumPosts: number;
  analyzedPosts: number;
  /** Changes after a sync so insights for the new data are requested. */
  version: string | null;
}

/** Soft, non-alarming panel for AI states that have no content yet. */
export function AiQuietState({ title, message, progress, onRetry }: { title: string; message: string; progress?: number; onRetry?: () => void }) {
  return (
    <View className="rounded-2xl bg-violet-light p-xl" accessibilityRole="summary">
      <View className="flex-row items-center">
        <Ionicons name="sparkles-outline" size={18} color={colors.violet} />
        <Text className="ml-sm flex-1 text-title text-navy">{title}</Text>
      </View>
      <Text className="mt-sm text-label font-normal text-navy-light">{message}</Text>
      {progress !== undefined ? (
        <View className="mt-lg">
          <AnimatedBar ratio={progress} color={colors.violet} track={colors.white} />
        </View>
      ) : null}
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" className="mt-sm min-h-11 justify-center self-start">
          <Text className="text-label font-bold text-violet">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** AI section. Loads separately so the measured metrics never wait on Gemini. */
export function AiInsightsSection(props: AiInsightsSectionProps) {
  return (
    <View className="mb-2xl">
      <SectionTitle eyebrow="AI intelligence" eyebrowIcon="sparkles" eyebrowColor={colors.violet} title="What we found" />
      {!props.aiConfigured ? (
        <AiQuietState title="AI analysis is temporarily unavailable" message="Your measured metrics are unaffected. Insights will return when the AI service is available." />
      ) : !props.rankingSufficient ? (
        <AiQuietState
          title="More content history needed"
          message={`AI insights unlock at ${props.minimumPosts} posts with engagement data. ${props.analyzedPosts} analyzed so far.`}
          progress={props.minimumPosts > 0 ? props.analyzedPosts / props.minimumPosts : 0}
        />
      ) : (
        <InsightsLoader accountId={props.accountId} version={props.version} />
      )}
    </View>
  );
}

function InsightsLoader({ accountId, version }: { accountId: string; version: string | null }) {
  const router = useRouter();
  // `version` is part of the fetcher identity so a completed sync requests fresh insights.
  const fetcher = useCallback(() => fetchAiInsights(accountId), [accountId, version]);
  const { state, reload } = useApiResource(fetcher);

  useEffect(() => {
    if (state.status === 'success') intelligenceSession.setInsights(accountId, state.data);
  }, [state, accountId]);

  const open = (insight: AiInsight) => router.push({ pathname: '/intelligence/insight/[id]', params: { id: insight.id, accountId } });

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Generating AI insights">
        <Skeleton className="h-52 w-full rounded-2xl" />
      </View>
    );
  }
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? (state.code ?? 'AI_UNAVAILABLE') : 'AI_UNAVAILABLE', state.message);
    return <AiQuietState title={copy.title} message={copy.message} onRetry={reload} />;
  }

  const [featured, ...rest] = state.data.insights;
  if (!featured) return <AiQuietState title="No insights yet" message="Try again after your next sync." onRetry={reload} />;

  return (
    <View>
      <InsightHero insight={featured} onPress={() => open(featured)} />
      {rest.length > 0 ? (
        <View className="mt-lg">
          {rest.map((insight) => {
            const label = INSIGHT_LABELS[insight.type];
            return (
              <PressableScale
                key={insight.id}
                onPress={() => open(insight)}
                accessibilityRole="button"
                accessibilityLabel={`${label.label}: ${insight.title}`}
                className="min-h-16 flex-row items-center py-md"
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-light">
                  <Ionicons name={label.icon} size={20} color={colors.violet} />
                </View>
                <View className="ml-md flex-1">
                  <Text className="text-overline uppercase tracking-widest text-violet">{label.label}</Text>
                  <Text className="mt-0.5 text-body font-semibold text-navy" numberOfLines={2}>
                    {insight.title}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.neutral300} />
              </PressableScale>
            );
          })}
        </View>
      ) : null}
      <Text className="mt-sm text-caption text-neutral-400">Generated {formatRelativeTime(state.data.generatedAt).toLowerCase()} · AI interpretations — verify before acting</Text>
    </View>
  );
}
