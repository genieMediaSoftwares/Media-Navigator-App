import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode, useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Gradient } from '@/components/visual/Gradient';
import { colors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { describeIntelligenceError } from '@/features/intelligence/labels';
import { useApiResource } from '@/hooks/useApiResource';
import { AiTrendInterpretation, DetectedTrend, PriorityTask } from '@/types/analysis';

import { fetchTrends, fetchTrendsAi } from '../api';
import { ConfidenceMeter, SectionLabel, SourceTag } from './Primitives';
import { TaskList } from './TaskList';

const CATEGORY: Record<DetectedTrend['category'], { label: string; icon: ComponentProps<typeof Ionicons>['name'] }> = {
  format: { label: 'Format', icon: 'layers-outline' },
  format_momentum: { label: 'Format momentum', icon: 'pulse-outline' },
  momentum: { label: 'Engagement trend', icon: 'trending-up-outline' },
  caption: { label: 'Captions', icon: 'text-outline' },
  hashtags: { label: 'Hashtags', icon: 'pricetag-outline' },
  length: { label: 'Video length', icon: 'timer-outline' },
  topic: { label: 'Topic', icon: 'chatbubbles-outline' },
  timing: { label: 'Timing', icon: 'time-outline' },
  watch_time: { label: 'Watch time', icon: 'eye-outline' },
  frequency: { label: 'Posting frequency', icon: 'calendar-outline' },
};

const IMPACT: Record<PriorityTask['impact'], string> = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };

function TrendCard({ trend, ai, task }: { trend: DetectedTrend; ai: AiTrendInterpretation['interpretations'][number] | undefined; task: PriorityTask | undefined }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY[trend.category];
  const up = trend.direction === 'up';
  return (
    <View className={`mb-md rounded-xl border bg-white p-lg ${task ? 'border-navy/20' : 'border-neutral-100'}`}>
      {task ? (
        <View className="mb-md flex-row items-center">
          <View className="mr-sm h-6 w-6 items-center justify-center rounded-full bg-navy">
            <Text className="text-caption font-bold text-white">{task.priority}</Text>
          </View>
          <Text className="flex-1 text-title text-navy">{task.title}</Text>
          <Text className="text-caption font-semibold text-neutral-500">{IMPACT[task.impact]}</Text>
        </View>
      ) : null}
      <View className="mb-sm flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Ionicons name={cat.icon} size={15} color={colors.neutral500} />
          <Text className="ml-xs text-caption font-semibold uppercase tracking-wide text-neutral-500">{cat.label}</Text>
        </View>
        <View className={`flex-row items-center rounded-full px-sm py-0.5 ${up ? 'bg-success-light' : 'bg-warning-light'}`}>
          <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? colors.success : colors.warning} />
          <Text className={`ml-xs text-caption font-semibold ${up ? 'text-success' : 'text-warning'}`}>{up ? 'Working' : 'Declining'}</Text>
        </View>
      </View>
      <Text className="text-body font-semibold text-navy">Trend detected</Text>
      <Text className="mt-xs text-body text-navy-light">{trend.headline}.</Text>
      <View className="mt-sm">
        <ConfidenceMeter confidence={trend.confidence} />
      </View>
      <View className="mt-md rounded-lg bg-neutral-50 p-md">
        <Text className="text-caption font-semibold uppercase tracking-wide text-neutral-500">Recommendation</Text>
        <Text className="mt-xs text-label text-navy">{ai?.recommendation || trend.recommendation}</Text>
      </View>
      {ai ? (
        <View className="mt-md">
          <SourceTag kind="ai" />
          <Text className="mt-xs text-label font-normal text-navy-light">{ai.interpretation}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="mt-sm min-h-10 flex-row items-center self-start">
        <Text className="text-caption font-semibold text-primary">{open ? 'Hide data' : `Supporting data · ${trend.sampleSize} vs ${trend.comparisonSize} posts`}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
      </Pressable>
      {open ? (
        <View className="mt-xs">
          <SourceTag kind="measured" />
          {trend.evidence.map((e) => (
            <View key={`${e.label}${e.value}`} className="mt-xs flex-row justify-between">
              <Text className="mr-md flex-1 text-caption text-neutral-500">{e.label}</Text>
              <Text className="flex-1 text-right text-caption font-semibold text-navy">{e.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * AI Trends: every measured pattern with its recommendation. Patterns that are also priorities carry
 * their priority and impact and come first (one card each, no repeated list). AI interpretation is
 * layered on top on request. Trends are detected by the server
 * from the full history; the AI only explains them.
 */
export function TrendsSection({ accountId, version }: { accountId: string; version: string | null }) {
  const fetcher = useCallback(
    () => fetchTrends(accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, version],
  );
  const { state, reload } = useApiResource(fetcher);
  const [aiRequested, setAiRequested] = useState(false);

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading trends">
        <Skeleton className="mb-lg h-40 w-full rounded-xl" />
        <Skeleton className="mb-lg h-32 w-full rounded-xl" />
      </View>
    );
  }
  if (state.status !== 'success') return <ErrorState message={state.message} onRetry={reload} />;
  const data = state.data;
  const platformName = platformOption(data.account.platform).name;
  if (!data.sufficient) {
    return <EmptyState icon="analytics-outline" title="More content history needed" message={`Trends are detected from at least ${data.minimumRequired} posts older than 3 days (${data.postsAnalyzed} so far).`} />;
  }

  return (
    <View>
      <Text className="text-heading text-navy" accessibilityRole="header">
        AI Trends
      </Text>
      <Text className="mb-xl mt-xs text-label font-normal text-neutral-500">Patterns measured across all {data.postsAnalyzed.toLocaleString()} analyzed posts, and what to do about them.</Text>

      {/* Priorities that are not tied to a single trend (e.g. reviewing the weakest posts). */}
      {data.tasks.some((t) => t.trendId === null) ? (
        <View className="mb-xl">
          <TaskList tasks={data.tasks.filter((t) => t.trendId === null)} />
        </View>
      ) : null}

      {data.aiConfigured && data.trends.length > 0 ? (
        aiRequested ? (
          <AiSummary accountId={accountId} version={version}>
            {(ai) => <TrendCards trends={data.trends} tasks={data.tasks} ai={ai} />}
          </AiSummary>
        ) : (
          <>
            <Pressable onPress={() => setAiRequested(true)} accessibilityRole="button" className="mb-xl">
              <Gradient name="ai" direction="horizontal" style={{ borderRadius: 999, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={18} color={colors.white} />
                <Text className="ml-sm text-body font-semibold text-white">Explain these trends with AI</Text>
              </Gradient>
            </Pressable>
            <TrendCards trends={data.trends} tasks={data.tasks} ai={null} />
          </>
        )
      ) : (
        <TrendCards trends={data.trends} tasks={data.tasks} ai={null} />
      )}

      {data.unavailable.length > 0 ? (
        <View className="mt-lg rounded-xl bg-neutral-50 p-lg">
          <Text className="mb-xs text-label font-semibold text-navy">Not measurable from {platformName}’s API</Text>
          {data.unavailable.map((u) => (
            <Text key={u.topic} className="mt-xs text-caption text-neutral-500">
              <Text className="font-semibold">{u.topic}:</Text> {u.reason}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TrendCards({ trends, tasks, ai }: { trends: DetectedTrend[]; tasks: PriorityTask[]; ai: AiTrendInterpretation | null }) {
  if (trends.length === 0) {
    return <Text className="text-label font-normal text-neutral-500">No clear patterns yet: your posts perform similarly across formats, topics and times.</Text>;
  }
  const taskOf = (t: DetectedTrend) => tasks.find((task) => task.trendId === t.id);
  const prioritized = trends.filter(taskOf).sort((a, b) => (taskOf(a)?.priority ?? 0) - (taskOf(b)?.priority ?? 0));
  const rest = trends.filter((t) => !taskOf(t));
  const card = (t: DetectedTrend) => <TrendCard key={t.id} trend={t} task={taskOf(t)} ai={ai?.interpretations.find((i) => i.trendId === t.id)} />;
  return (
    <View>
      {prioritized.length > 0 ? <SectionLabel>Priorities</SectionLabel> : null}
      {prioritized.map(card)}
      {rest.length > 0 ? (
        <View className={prioritized.length > 0 ? 'mt-lg' : ''}>
          <SectionLabel>Other patterns</SectionLabel>
        </View>
      ) : null}
      {rest.map(card)}
    </View>
  );
}

function AiSummary({ accountId, version, children }: { accountId: string; version: string | null; children: (ai: AiTrendInterpretation | null) => ReactNode }) {
  const fetcher = useCallback(
    () => fetchTrendsAi(accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, version],
  );
  const { state, reload } = useApiResource(fetcher);
  if (state.status === 'loading') {
    return (
      <View>
        <Skeleton className="mb-xl h-24 w-full rounded-xl" />
        {children(null)}
      </View>
    );
  }
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? state.code : undefined, state.message);
    return (
      <View>
        <View className="mb-xl rounded-lg bg-neutral-50 p-md">
          <Text className="text-label font-semibold text-navy">{copy.title}</Text>
          <Text className="mt-xs text-caption text-neutral-500">{copy.message}</Text>
          <Button title="Try again" variant="ghost" size="sm" onPress={reload} />
        </View>
        {children(null)}
      </View>
    );
  }
  const ai = state.data;
  return (
    <View>
      <View className="mb-xl rounded-xl border border-violet-border bg-violet-light/40 p-lg">
        <SourceTag kind="ai" />
        <Text className="mt-sm text-body text-navy">{ai.summary}</Text>
        {ai.opportunities.length > 0 ? (
          <>
            <Text className="mb-sm mt-lg text-title text-navy">Opportunities for new content</Text>
            {ai.opportunities.map((o) => (
              <View key={o.title} className="mb-md">
                <Text className="text-label font-semibold text-navy">{o.title}</Text>
                <Text className="mt-0.5 text-label font-normal text-navy-light">{o.suggestion}</Text>
                <Text className="mt-0.5 text-caption text-neutral-500">{o.rationale}</Text>
              </View>
            ))}
          </>
        ) : null}
        <Text className="mt-xs text-caption text-neutral-400">AI interpretation of the measured trends below. Numbers come from your synced data only.</Text>
      </View>
      {children(ai)}
    </View>
  );
}
