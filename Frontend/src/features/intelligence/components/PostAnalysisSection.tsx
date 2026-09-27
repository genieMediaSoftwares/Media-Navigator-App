import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { Gradient } from '@/components/visual/Gradient';
import { PressableScale } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { useApiResource } from '@/hooks/useApiResource';
import { AiPostAnalysis, PostClassification } from '@/types/api';

import { fetchPostAnalysis } from '../api';
import { describeIntelligenceError, FORMAT_LABELS } from '../labels';
import { AiQuietState } from './AiInsightsSection';
import { EvidenceBlock } from './Evidence';

interface PostAnalysisSectionProps {
  accountId: string | null;
  postId: string;
  classification: PostClassification;
  aiConfigured: boolean;
  /** Start immediately (the user tapped "Why it worked" / a diagnosis). */
  autoStart: boolean;
}

/** AI interpretation of one post. Requested on demand; every block is labelled as AI output. */
export function PostAnalysisSection({ accountId, postId, classification, aiConfigured, autoStart }: PostAnalysisSectionProps) {
  const [started, setStarted] = useState(autoStart);
  const heading = classification === 'top' ? 'Why it worked' : classification === 'attention' ? 'Diagnosis' : 'AI analysis';

  let body;
  if (classification === 'insufficient') {
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
    body = <AnalysisLoader accountId={accountId} postId={postId} />;
  }

  return (
    <View className="mb-2xl">
      <Overline icon="sparkles" color={colors.violet} className="mb-xs">
        AI intelligence
      </Overline>
      <Text className="mb-lg text-heading text-navy" accessibilityRole="header">
        {heading}
      </Text>
      {body}
    </View>
  );
}

function AnalysisLoader({ accountId, postId }: { accountId: string | null; postId: string }) {
  const fetcher = useCallback(() => fetchPostAnalysis(accountId, postId), [accountId, postId]);
  const { state, reload } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Analyzing this post against your history">
        <Text className="mb-md text-label font-normal text-neutral-500">Analyzing this post against your history…</Text>
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
  return <AnalysisBlocks analysis={state.data} />;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item) => (
        <View key={item} className="mb-xs flex-row">
          <Text className="mr-sm text-body text-warning">•</Text>
          <Text className="flex-1 text-body text-navy-light">{item}</Text>
        </View>
      ))}
    </View>
  );
}

function AnalysisBlocks({ analysis }: { analysis: AiPostAnalysis }) {
  const attention = analysis.kind === 'attention';
  return (
    <View>
      <EvidenceBlock title={attention ? 'What happened' : 'Summary'} kind="aiSummary">
        {analysis.summary}
      </EvidenceBlock>
      {analysis.contributingFactors.length > 0 ? (
        <EvidenceBlock title="Possible contributing factors" kind="aiHypothesis">
          <Bullets items={analysis.contributingFactors} />
        </EvidenceBlock>
      ) : null}
      {analysis.explanation ? (
        <EvidenceBlock title={analysis.kind === 'top' ? 'Why it may have worked' : 'Why this may have happened'} kind="aiHypothesis">
          {analysis.explanation}
        </EvidenceBlock>
      ) : null}
      {analysis.recommendation ? (
        <EvidenceBlock title={analysis.kind === 'top' ? 'Pattern to repeat' : attention ? 'Diagnostic opportunity' : 'Recommendation'} kind="aiSuggestion">
          {analysis.recommendation}
        </EvidenceBlock>
      ) : null}
      {analysis.suggestedHook ? (
        <EvidenceBlock title={attention ? 'Alternative hook to try' : 'Hook to try'} kind="aiSuggestion">
          {`“${analysis.suggestedHook}”`}
        </EvidenceBlock>
      ) : null}
      {analysis.suggestedFormat ? (
        <EvidenceBlock title="Suggested format" kind="aiSuggestion">
          {FORMAT_LABELS[analysis.suggestedFormat].singular}
        </EvidenceBlock>
      ) : null}
      {analysis.nextTest ? (
        <EvidenceBlock title="Suggested experiment" kind="aiSuggestion">
          {analysis.nextTest}
        </EvidenceBlock>
      ) : null}
      {analysis.expectedMeasurement ? (
        <EvidenceBlock title="What to measure next" kind="aiSuggestion">
          {analysis.expectedMeasurement}
        </EvidenceBlock>
      ) : null}
      <Text className="text-caption text-neutral-400">AI interpretations are hypotheses based on your synced metrics, not verified causes.</Text>
    </View>
  );
}
