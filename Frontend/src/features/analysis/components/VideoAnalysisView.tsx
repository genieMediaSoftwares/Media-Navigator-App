import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { describeIntelligenceError } from '@/features/intelligence/labels';
import { useApiResource } from '@/hooks/useApiResource';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { VideoAnalysisResponse } from '@/types/analysis';

import { fetchVideoAnalysis } from '../api';
import { MetricCell, NumberedItem, SectionLabel, SourceTag } from './Primitives';

function diff(value: number | null, reference: number | null): string | undefined {
  if (value === null || reference === null || reference <= 0) return undefined;
  const p = Math.round(((value - reference) / reference) * 100);
  return `${p >= 0 ? '+' : '−'}${Math.abs(p)}% vs typical post`;
}

function Field({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <View className="mb-md">
      <Text className="text-caption font-semibold uppercase tracking-wide text-neutral-500">{label}</Text>
      <Text className="mt-0.5 text-body text-navy">{text}</Text>
    </View>
  );
}

function Observed({ data }: { data: VideoAnalysisResponse['observed'] }) {
  const m = data.metrics;
  const acc = data.comparisons.account;
  return (
    <View className="mb-2xl">
      <SourceTag kind="measured" />
      <Text className="mb-md mt-sm text-title text-navy" accessibilityRole="header">
        Observed performance
      </Text>
      <View className="flex-row flex-wrap">
        <MetricCell label="Views" value={m.views === null ? null : formatCompactNumber(m.views)} hint={diff(m.views, acc.views)} />
        <MetricCell label="Likes" value={m.likes === null ? null : formatCompactNumber(m.likes)} hint={diff(m.likes, acc.likes)} />
        <MetricCell label="Shares" value={m.shares === null ? null : formatCompactNumber(m.shares)} hint={diff(m.shares, acc.shares)} />
        <MetricCell label="Saves" value={m.saves === null ? null : formatCompactNumber(m.saves)} hint={diff(m.saves, acc.saves)} />
        <MetricCell label="Engagement rate" value={data.engagementRate === null ? null : formatPercent(data.engagementRate, 2)} hint={diff(data.engagementRate, acc.engagementRate)} />
        <MetricCell label="Avg watch time" value={data.avgWatchTimeMs === null ? null : `${(data.avgWatchTimeMs / 1000).toFixed(1)}s`} hint={data.avgWatchTimeMs === null ? 'Not returned by Instagram' : undefined} />
      </View>
      <Text className="text-caption text-neutral-500">
        Typical similar post ({data.comparisons.similar.postCount} compared): {data.comparisons.similar.views === null ? 'views not available' : `${formatCompactNumber(data.comparisons.similar.views)} views`}. Typical of your best {data.comparisons.best.postCount}:{' '}
        {data.comparisons.best.views === null ? 'views not available' : `${formatCompactNumber(data.comparisons.best.views)} views`}. Performance score {data.score ?? '–'}/100.
      </Text>
    </View>
  );
}

const STRENGTH = { strong: { label: 'Strong hook', bg: 'bg-success-light', fg: 'text-success' }, moderate: { label: 'Moderate hook', bg: 'bg-sky', fg: 'text-primary' }, weak: { label: 'Weak hook', bg: 'bg-warning-light', fg: 'text-warning' } };

function AiSections({ ai }: { ai: NonNullable<VideoAnalysisResponse['ai']> }) {
  const strength = STRENGTH[ai.hook.strength];
  return (
    <View>
      <SourceTag kind="ai" />
      <Text className="mb-lg mt-sm text-body text-navy">{ai.summary}</Text>

      <SectionLabel>Hook · first 1–3 seconds</SectionLabel>
      <View className="mb-md flex-row flex-wrap">
        <View className={`mb-xs mr-sm rounded-full px-md py-1 ${strength.bg}`}>
          <Text className={`text-caption font-semibold ${strength.fg}`}>{strength.label}</Text>
        </View>
        <View className={`mb-xs rounded-full px-md py-1 ${ai.hook.topicClearQuickly ? 'bg-success-light' : 'bg-warning-light'}`}>
          <Text className={`text-caption font-semibold ${ai.hook.topicClearQuickly ? 'text-success' : 'text-warning'}`}>
            {ai.hook.topicClearQuickly ? 'Topic clear immediately' : 'Topic not clear immediately'}
          </Text>
        </View>
      </View>
      <Field label="Opening" text={ai.hook.opening} />
      <Field label="Assessment" text={ai.hook.assessment} />

      <View className="mt-lg">
        <SectionLabel>Content structure</SectionLabel>
      </View>
      <Field label="Introduction" text={ai.structure.intro} />
      <Field label="Main content" text={ai.structure.mainContent} />
      <Field label="Pacing" text={ai.structure.pacing} />
      <Field label="Transitions" text={ai.structure.transitions} />
      <Field label="Story structure" text={ai.structure.story} />
      <Field label="Ending / CTA" text={ai.structure.endingCta} />

      {ai.keyMoments.length > 0 ? (
        <View className="mb-lg">
          <Text className="mb-sm text-caption font-semibold uppercase tracking-wide text-neutral-500">Key moments</Text>
          {ai.keyMoments.map((k) => (
            <View key={`${k.timestamp}${k.note}`} className="mb-xs flex-row">
              <Text className="w-14 text-label font-semibold text-violet">{k.timestamp}</Text>
              <Text className="flex-1 text-label font-normal text-navy">{k.note}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-lg">
        <SectionLabel>Visual analysis</SectionLabel>
      </View>
      <Field label="Framing" text={ai.visual.framing} />
      <Field label="Text overlays" text={ai.visual.textOverlays} />
      <Field label="Visual clarity" text={ai.visual.clarity} />
      <Field label="Scene changes" text={ai.visual.sceneChanges} />
      <Field label="Branding" text={ai.visual.branding} />
      <Field label="Thumbnail / cover" text={ai.visual.cover} />

      <View className="mt-lg">
        <SectionLabel>Engagement potential</SectionLabel>
      </View>
      <Field label="Why viewers likely watched" text={ai.engagement.whyViewersWatched} />
      <Field label="Shareability" text={ai.engagement.shareability} />
      <Field label="Saveability" text={ai.engagement.saveability} />
      <Field label="Comment potential" text={ai.engagement.commentPotential} />
      <Field label="CTA effectiveness" text={ai.engagement.ctaEffectiveness} />

      {ai.recommendations.length > 0 ? (
        <View className="mt-lg">
          <SectionLabel>Recommendations</SectionLabel>
          {ai.recommendations.map((r, i) => (
            <NumberedItem key={r} index={i + 1} title={r} tone="ai" />
          ))}
        </View>
      ) : null}
      {ai.cannotAssess.length > 0 ? <Text className="mt-sm text-caption text-neutral-500">Cannot be assessed: {ai.cannotAssess.join(' · ')}</Text> : null}
      <Text className="mt-md text-caption text-neutral-400">Written by AI after watching the video. Interpretations, not Instagram metrics.</Text>
    </View>
  );
}

/**
 * Deep Video Analysis: measured performance first, then the AI's reading of the video itself (hook,
 * structure, visuals, engagement potential). The AI step downloads the video, so it runs on request.
 */
export function VideoAnalysisView({ accountId, postId, autoStart = false }: { accountId: string | null; postId: string; autoStart?: boolean }) {
  const [started, setStarted] = useState(autoStart);
  if (!started) {
    return (
      <View className="items-center rounded-xl bg-neutral-50 p-xl">
        <Ionicons name="film-outline" size={28} color={colors.violet} />
        <Text className="mt-sm text-center text-title text-navy">Deep video analysis</Text>
        <Text className="mb-lg mt-xs text-center text-label font-normal text-neutral-500">AI watches this video and reviews its hook, structure, visuals and engagement potential against your measured results. Takes up to a minute.</Text>
        <Button title="Analyze this video" icon="sparkles-outline" onPress={() => setStarted(true)} />
      </View>
    );
  }
  return <VideoAnalysisLoader accountId={accountId} postId={postId} />;
}

function VideoAnalysisLoader({ accountId, postId }: { accountId: string | null; postId: string }) {
  const fetcher = useCallback(() => fetchVideoAnalysis(accountId, postId), [accountId, postId]);
  const { state, reload } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Analyzing video">
        <Text className="mb-md text-label font-normal text-neutral-500">Watching the video and comparing it with your posts… this can take up to a minute.</Text>
        <Skeleton className="mb-md h-24 w-full rounded-xl" />
        <Skeleton className="mb-sm h-4 w-full" />
        <Skeleton className="mb-sm h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </View>
    );
  }
  if (state.status !== 'success') {
    const code = state.status === 'error' ? state.code : undefined;
    const known = code === 'VIDEO_NOT_AVAILABLE' || code === 'VIDEO_TOO_LARGE' || code === 'NOT_A_VIDEO';
    const copy = known ? { title: 'Video can’t be analyzed', message: state.message } : describeIntelligenceError(code, state.message);
    return (
      <View className="rounded-xl bg-neutral-50 p-lg">
        <Text className="text-label font-semibold text-navy">{copy.title}</Text>
        <Text className="mt-xs text-caption text-neutral-500">{copy.message}</Text>
        {!known ? <Button title="Try again" variant="ghost" size="sm" onPress={reload} /> : null}
      </View>
    );
  }
  return (
    <View>
      <Observed data={state.data.observed} />
      {state.data.ai ? (
        <AiSections ai={state.data.ai} />
      ) : (
        <Text className="text-label font-normal text-neutral-500">AI analysis is not configured on this server. The measured performance above is unaffected.</Text>
      )}
    </View>
  );
}
