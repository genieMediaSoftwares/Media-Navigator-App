import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { describeIntelligenceError } from '@/features/intelligence/labels';
import { useApiResource } from '@/hooks/useApiResource';
import { Improvement, ObservedReason, PerformerType } from '@/types/analysis';

import { fetchPerformanceAnalysis } from '../api';
import { NumberedItem, SourceTag } from './Primitives';

interface ReasonsPanelProps {
  accountId: string | null;
  postId: string;
  kind: PerformerType;
  reasons: ObservedReason[];
  improvements: Improvement[];
  aiConfigured: boolean;
  /** Start the AI request immediately. */
  autoStartAi?: boolean;
}

/**
 * "Why it's top" / "Why it needs improvement": measured reasons first (always available), then the
 * AI interpretation on request, then "How to improve". Each block carries its source label.
 */
export function ReasonsPanel({ accountId, postId, kind, reasons, improvements, aiConfigured, autoStartAi = false }: ReasonsPanelProps) {
  const [aiStarted, setAiStarted] = useState(autoStartAi);
  const tone = kind === 'top' ? 'positive' : 'negative';

  return (
    <View>
      <SourceTag kind="measured" />
      <Text className="mb-md mt-sm text-title text-navy" accessibilityRole="header">
        {kind === 'top' ? 'What the numbers show' : 'Where it fell short'}
      </Text>
      {reasons.length === 0 ? (
        <Text className="mb-lg text-label font-normal text-neutral-500">No metric stands out clearly against your account average for this post.</Text>
      ) : (
        reasons.map((r, i) => <NumberedItem key={r.id} index={i + 1} title={r.statement} tone={tone} />)
      )}

      <View className="mb-lg mt-sm">
        {!aiConfigured ? (
          <Text className="text-caption text-neutral-500">AI interpretation is not configured on this server. The measured reasons above are unaffected.</Text>
        ) : aiStarted ? (
          <AiReasons accountId={accountId} postId={postId} kind={kind} />
        ) : (
          <Button title={kind === 'top' ? 'Explain with AI (hook, topic, visuals)' : 'Diagnose with AI (hook, topic, visuals)'} icon="sparkles-outline" variant="secondary" onPress={() => setAiStarted(true)} />
        )}
      </View>

      {kind === 'improve' && improvements.length > 0 ? (
        <View className="mb-md">
          <SourceTag kind="rule" />
          <Text className="mb-md mt-sm text-title text-navy" accessibilityRole="header">
            How to improve
          </Text>
          {improvements.map((imp, i) => (
            <NumberedItem key={`${imp.area}${i}`} index={i + 1} title={imp.action} detail={imp.basis} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AiReasons({ accountId, postId, kind }: { accountId: string | null; postId: string; kind: PerformerType }) {
  const fetcher = useCallback(() => fetchPerformanceAnalysis(accountId, postId, kind), [accountId, postId, kind]);
  const { state, reload } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="AI is analyzing this post">
        <Text className="mb-md text-label font-normal text-neutral-500">Comparing this post’s content with your history…</Text>
        <Skeleton className="mb-sm h-4 w-full" />
        <Skeleton className="mb-sm h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </View>
    );
  }
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? state.code : undefined, state.message);
    return (
      <View className="rounded-lg bg-neutral-50 p-md">
        <Text className="text-label font-semibold text-navy">{copy.title}</Text>
        <Text className="mt-xs text-caption text-neutral-500">{copy.message}</Text>
        <Button title="Try again" variant="ghost" size="sm" onPress={reload} />
      </View>
    );
  }
  const ai = state.data.ai;
  return (
    <View className="rounded-xl border border-violet-border bg-violet-light/40 p-lg">
      <SourceTag kind="ai" />
      <Text className="mt-sm text-body text-navy">{ai.summary}</Text>
      <Text className="mb-md mt-lg text-title text-navy" accessibilityRole="header">
        {kind === 'top' ? 'Why it performed well' : 'Why it may have underperformed'}
      </Text>
      {ai.reasons.map((r, i) => (
        <NumberedItem key={`${r.title}${i}`} index={i + 1} title={r.title} detail={r.detail} tone="ai" />
      ))}
      {ai.improvements.length > 0 ? (
        <>
          <Text className="mb-md mt-sm text-title text-navy" accessibilityRole="header">
            {kind === 'top' ? 'What to repeat' : 'What to change next time'}
          </Text>
          {ai.improvements.map((imp, i) => (
            <View key={`${imp.action}${i}`} className="mb-sm flex-row">
              <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.violet} style={{ marginTop: 2 }} />
              <View className="ml-sm flex-1">
                <Text className="text-body text-navy">{imp.action}</Text>
                {imp.why ? <Text className="text-caption text-neutral-500">{imp.why}</Text> : null}
              </View>
            </View>
          ))}
        </>
      ) : null}
      {ai.cannotConfirm.length > 0 ? <Text className="mt-md text-caption text-neutral-500">Cannot be confirmed from the data: {ai.cannotConfirm.join(' · ')}</Text> : null}
      <Text className="mt-md text-caption text-neutral-400">
        Written by AI from this post’s measured data and caption{ai.usedCoverImage ? ' and cover image' : ''}. These are interpretations to test, not Instagram metrics.
      </Text>
    </View>
  );
}
