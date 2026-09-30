import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { Gradient } from '@/components/visual/Gradient';
import { PressableScale } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { useApiResource } from '@/hooks/useApiResource';
import { AiPostAnalysis, ContentFormat, ContentTier } from '@/types/api';

import { fetchPostAnalysis } from '../api';
import { describeIntelligenceError, FORMAT_LABELS } from '../labels';
import { AiQuietState } from './AiInsightsSection';
import { EvidenceBlock } from './Evidence';

/** The question each tier answers, and how its next steps are framed. */
const TIER_QUESTIONS: Record<ContentTier, { heading: string; actions: string; intro?: string }> = {
  top: { heading: 'Why this content worked', actions: 'What to repeat' },
  moderate: { heading: 'What is limiting this content?', actions: 'Try next time' },
  low: { heading: 'Why it may have underperformed', actions: 'What to try instead' },
  new: {
    heading: 'Early results',
    actions: 'Try next time',
    intro: 'This post was published in the last 3 days and is still collecting interactions.',
  },
};

interface PostAnalysisSectionProps {
  accountId: string | null;
  postId: string;
  /** null when the account does not have enough history to classify posts. */
  tier: ContentTier | null;
  postFormat: ContentFormat;
  aiConfigured: boolean;
  /** Start immediately (the user tapped "Why it worked" / "How to improve" / …). */
  autoStart: boolean;
}

/** AI interpretation of one post, framed by its tier. Requested on demand; every block says it is AI output. */
export function PostAnalysisSection({ accountId, postId, tier, postFormat, aiConfigured, autoStart }: PostAnalysisSectionProps) {
  const [started, setStarted] = useState(autoStart);
  const question = tier ? TIER_QUESTIONS[tier] : null;

  let body;
  if (!tier || !question) {
    body = <AiQuietState title="More content history needed" message="This post can be analyzed once your account has enough posts to compare against." />;
  } else if (!aiConfigured) {
    body = <AiQuietState title="AI analysis is temporarily unavailable" message="The measured performance above is unaffected." />;
  } else if (!started) {
    body = (
      <PressableScale onPress={() => setStarted(true)} accessibilityRole="button" accessibilityLabel="Analyze this post with AI">
        <Gradient name="ai" direction="horizontal" style={{ borderRadius: 999, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={18} color={colors.white} />
          <Text className="ml-sm text-body font-semibold text-white">Analyze with AI</Text>
        </Gradient>
      </PressableScale>
    );
  } else {
    body = <AnalysisLoader accountId={accountId} postId={postId} tier={tier} postFormat={postFormat} />;
  }

  return (
    <View className="mb-2xl">
      <Overline icon="sparkles" color={colors.violet} className="mb-xs">
        AI analysis
      </Overline>
      <Text className="mb-sm text-heading text-navy" accessibilityRole="header">
        {question?.heading ?? 'AI analysis'}
      </Text>
      {question?.intro ? <Text className="mb-lg text-label font-normal text-neutral-500">{question.intro}</Text> : <View className="mb-sm" />}
      {body}
    </View>
  );
}

function AnalysisLoader({ accountId, postId, tier, postFormat }: { accountId: string | null; postId: string; tier: ContentTier; postFormat: ContentFormat }) {
  const fetcher = useCallback(() => fetchPostAnalysis(accountId, postId), [accountId, postId]);
  const { state, reload } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Comparing this post with your history">
        <Text className="mb-md text-label font-normal text-neutral-500">Comparing this post with your history…</Text>
        <Skeleton className="mb-sm h-4 w-full" />
        <Skeleton className="mb-sm h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </View>
    );
  }
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? (state.code ?? 'AI_UNAVAILABLE') : 'AI_UNAVAILABLE', state.message);
    return <AiQuietState title={copy.title} message={copy.message} onRetry={reload} />;
  }
  return <AnalysisBlocks analysis={state.data} tier={tier} postFormat={postFormat} />;
}

function Bullets({ items, color }: { items: string[]; color: string }) {
  return (
    <View>
      {items.map((item) => (
        <View key={item} className="mb-xs flex-row">
          <Text className="mr-sm text-body" style={{ color }}>
            •
          </Text>
          <Text className="flex-1 text-body text-navy-light">{item}</Text>
        </View>
      ))}
    </View>
  );
}

function AnalysisBlocks({ analysis, tier, postFormat }: { analysis: AiPostAnalysis; tier: ContentTier; postFormat: ContentFormat }) {
  const question = TIER_QUESTIONS[tier];
  // Older cached analyses have no `actions`; their recommendation and experiment are the same idea.
  const actions = analysis.actions && analysis.actions.length > 0 ? analysis.actions : [analysis.recommendation, analysis.nextTest].filter(Boolean);
  const stop = analysis.stop ?? [];
  const cannotConfirm = analysis.cannotConfirm ?? [];
  const reasons = analysis.contributingFactors;
  const differentFormat = analysis.suggestedFormat && analysis.suggestedFormat !== postFormat ? analysis.suggestedFormat : null;

  return (
    <View>
      <EvidenceBlock title="What the numbers show" kind="aiSummary">
        {analysis.summary}
      </EvidenceBlock>
      {reasons.length > 0 || analysis.explanation ? (
        <EvidenceBlock title={tier === 'top' ? 'Why it may have worked' : 'Possible reasons'} kind="aiHypothesis">
          {reasons.length > 0 ? <Bullets items={reasons} color={colors.warning} /> : null}
          {analysis.explanation ? <Text className={`text-body text-navy-light ${reasons.length > 0 ? 'mt-sm' : ''}`}>{analysis.explanation}</Text> : null}
        </EvidenceBlock>
      ) : null}
      {tier === 'low' && stop.length > 0 ? (
        <EvidenceBlock title="What to stop" kind="aiSuggestion">
          <Bullets items={stop} color={colors.danger} />
        </EvidenceBlock>
      ) : null}
      {actions.length > 0 ? (
        <EvidenceBlock title={question.actions} kind="aiSuggestion">
          <Bullets items={actions} color={colors.success} />
          {tier !== 'top' && analysis.suggestedHook ? <Text className="mt-sm text-body text-navy">Opening line to try: “{analysis.suggestedHook}”</Text> : null}
          {differentFormat ? <Text className="mt-sm text-body text-navy">Format to try: {FORMAT_LABELS[differentFormat].singular}</Text> : null}
        </EvidenceBlock>
      ) : null}
      {cannotConfirm.length > 0 ? (
        <EvidenceBlock title="What we cannot confirm" kind="aiSummary">
          <Bullets items={cannotConfirm} color={colors.neutral400} />
        </EvidenceBlock>
      ) : null}
      <Text className="text-caption text-neutral-400">Written by AI from your synced metrics. Reasons are possibilities to test, not proven causes.</Text>
    </View>
  );
}
