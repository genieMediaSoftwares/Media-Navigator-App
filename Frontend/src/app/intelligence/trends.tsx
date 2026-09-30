import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Skeleton } from '@/components/ui/Skeleton';
import { FadeIn } from '@/components/visual/Motion';
import { fetchAiInsights, fetchMediaPage } from '@/features/intelligence/api';
import { AiQuietState } from '@/features/intelligence/components/AiInsightsSection';
import { TrendBlock } from '@/features/intelligence/components/TrendBlock';
import { describeIntelligenceError, FORMAT_LABELS, INSIGHT_LABELS } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { describeLeadingFormat, formatPlural, leadingFormat } from '@/features/intelligence/tiers';
import { useIntelligenceOverview } from '@/features/intelligence/useIntelligenceOverview';
import { useApiResource } from '@/hooks/useApiResource';
import { DAY_NAMES, formatCompactNumber, formatHourRange, formatRelativeTime } from '@/lib/format';
import { ContentFormat, IntelligenceOverview } from '@/types/api';

/** Which formats the strongest posts are (measured on up to 50 top posts). */
function TopMix({ accountId, version }: { accountId: string; version: string | null }) {
  const fetcher = useCallback(
    () => fetchMediaPage({ accountId, tier: 'top', sort: 'interactions', limit: 50 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, version],
  );
  const { state } = useApiResource(fetcher);
  if (state.status === 'loading') return <Skeleton className="mb-xl h-24 w-full rounded-2xl" />;
  if (state.status !== 'success' || state.data.items.length < 3) return null;
  const counts = new Map<ContentFormat, number>();
  for (const post of state.data.items) counts.set(post.format, (counts.get(post.format) ?? 0) + 1);
  const [format, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const n = state.data.items.length;
  const scope = state.data.total > n ? `Of your ${n} strongest posts` : `Of your ${n} top posts`;
  return (
    <TrendBlock
      eyebrow="Top content"
      kind="observed"
      title={`${scope}, ${count} ${count === 1 ? 'is a' : 'are'} ${formatPlural(format, count)}.`}
      body={`Top = at least twice your typical post. ${[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([f, c]) => `${c} ${formatPlural(f, c)}`)
        .join(' · ')}`}
    />
  );
}

/** AI-written patterns, labelled as interpretation; the numbers they cite are rebuilt from stored data. */
function AiPatterns({ overview }: { overview: IntelligenceOverview }) {
  const router = useRouter();
  const accountId = overview.account.id;
  const fetcher = useCallback(
    () => fetchAiInsights(accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, overview.account.lastSyncedAt],
  );
  const { state, reload } = useApiResource(fetcher);
  useEffect(() => {
    if (state.status === 'success') intelligenceSession.setInsights(accountId, state.data);
  }, [state, accountId]);

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Finding patterns">
        <Text className="mb-md text-label font-normal text-neutral-500">Reading your content history…</Text>
        <Skeleton className="mb-md h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </View>
    );
  }
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? (state.code ?? 'AI_UNAVAILABLE') : 'AI_UNAVAILABLE', state.message);
    return <AiQuietState title={copy.title} message={copy.message} onRetry={reload} />;
  }
  return (
    <View>
      {state.data.insights.map((insight) => (
        <TrendBlock
          key={insight.id}
          eyebrow={INSIGHT_LABELS[insight.type].label}
          kind="aiSummary"
          title={insight.title}
          body={insight.observation}
          action={{ label: 'Evidence and what to do', onPress: () => router.push({ pathname: '/intelligence/insight/[id]', params: { id: insight.id, accountId } }) }}
        />
      ))}
      <Text className="text-caption text-neutral-400">Written by AI from your synced data {formatRelativeTime(state.data.generatedAt).toLowerCase()}. Interpretations, not proven causes.</Text>
    </View>
  );
}

function TrendsContent({ overview }: { overview: IntelligenceOverview }) {
  const router = useRouter();
  const accountId = overview.account.id;
  const lead = leadingFormat(overview.formats);
  const window = overview.timing.strongestWindow;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-md">
      <Text className="text-heading text-navy">What keeps showing up</Text>
      <Text className="mb-xl mt-xs text-label font-normal text-neutral-500">Patterns measured in your own history, then what the AI reads into them.</Text>

      <FadeIn>
        <Text className="mb-md text-title text-navy">Measured</Text>
        {lead ? (
          <TrendBlock
            eyebrow="Format"
            kind="observed"
            title={`${FORMAT_LABELS[lead.best.format].plural} get the most interactions.`}
            body={describeLeadingFormat(lead.best, lead.next)}
            action={{ label: 'Compare formats', onPress: () => router.push({ pathname: '/intelligence/formats', params: { accountId, format: lead.best.format } }) }}
          />
        ) : null}
        {overview.tiers.sufficient ? <TopMix accountId={accountId} version={overview.account.lastSyncedAt} /> : null}
        {window ? (
          <TrendBlock
            eyebrow="Timing"
            kind="observed"
            title={`${DAY_NAMES[window.dayOfWeek]} ${formatHourRange(window.startHour, window.endHour)} is your strongest window.`}
            body={`${formatCompactNumber(window.avgInteractions)} average interactions across ${window.postCount} posts (${overview.timing.timezone}).${window.postCount < 5 ? ' Few posts — treat it as something to test.' : ''}`}
            action={{ label: 'Open planner', onPress: () => router.navigate('/planner') }}
          />
        ) : (
          <TrendBlock
            eyebrow="Timing"
            kind="observed"
            title="Not enough history for timing patterns yet."
            body={`Timing appears after ${overview.timing.minimumRequired} posts with engagement data (${overview.timing.postsAnalyzed} so far).`}
          />
        )}
      </FadeIn>

      <FadeIn index={1} className="mt-md">
        <Text className="mb-md text-title text-navy">AI interpretation</Text>
        {!overview.aiConfigured ? (
          <AiQuietState title="AI analysis is temporarily unavailable" message="The measured patterns above are unaffected." />
        ) : !overview.tiers.sufficient ? (
          <AiQuietState title="More content history needed" message={`AI patterns need at least ${overview.tiers.minimumRequired} posts with engagement data.`} />
        ) : (
          <AiPatterns overview={overview} />
        )}
      </FadeIn>
    </ScrollView>
  );
}

/** Trends: what patterns keep appearing in this account's content. */
export default function TrendsScreen() {
  const { accountId = '' } = useLocalSearchParams<{ accountId?: string }>();
  const { state, reload } = useIntelligenceOverview(accountId);
  if (state.status === 'loading') return <LoadingState message="Loading patterns…" />;
  if (state.status === 'success' && state.data.overview) return <TrendsContent overview={state.data.overview} />;
  return (
    <View className="flex-1 bg-white p-xl">
      <ErrorState message={state.status === 'success' ? 'Connect an account to see patterns.' : state.message} onRetry={reload} />
    </View>
  );
}
