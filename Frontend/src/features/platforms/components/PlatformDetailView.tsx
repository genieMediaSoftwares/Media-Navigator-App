import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { MetricStrip, PerformanceBar } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { SocialPlatform } from '@/types/api';
import { blueprintOf, contentType, formatMetric } from '../blueprint';
import { getFixtureAccount } from '../fixtures';

interface PlatformDetailViewProps {
  platform: SocialPlatform;
  postId?: string;
}

export function PlatformDetailView({ platform, postId }: PlatformDetailViewProps) {
  const { width } = useWindowDimensions();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);

  const post = fix.posts.find((p) => p.id === postId) ?? fix.posts[0];
  const typeSpec = contentType(bp, post.contentTypeId);

  const [expandedCaption, setExpandedCaption] = useState(false);

  // Derive metrics list
  const metricsList = bp.metrics
    .map((m) => {
      const val = post.metrics[m.key];
      const formatted = formatMetric(val, m.kind);
      if (formatted === null) return null;
      return { label: m.label, value: formatted };
    })
    .filter((item): item is { label: string; value: string } => item !== null);

  const primaryMetrics = metricsList.slice(0, 3);
  const secondaryMetrics = metricsList.slice(3);

  // Comparison logic
  const benchmarkMetricSpec = bp.metrics.find((m) => m.key === bp.benchmarkMetric) ?? bp.metrics[0];
  const itemBenchmarkVal = post.metrics[bp.benchmarkMetric] ?? 0;
  const typicalVal = Math.round((itemBenchmarkVal as number) * (1 / (1 + post.vsBenchmarkPercent / 100)));
  const barMax = Math.max(itemBenchmarkVal as number, typicalVal, 1);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-3xl">
      {/* Content Hero */}
      {typeSpec.textFirst ? (
        <View className="bg-neutral-900 p-2xl pt-3xl">
          <View className="flex-row items-center rounded-full px-md py-1 self-start mb-md" style={{ backgroundColor: typeSpec.color }}>
            <Ionicons name={typeSpec.icon} size={14} color={colors.white} />
            <Text className="ml-xs text-caption font-bold text-white uppercase">{typeSpec.singular}</Text>
          </View>
          <Text className="text-heading font-semibold text-white leading-relaxed">{post.caption}</Text>
        </View>
      ) : (
        <View style={{ width, height: Math.min(width * 0.85, 420) }} className="bg-neutral-900 relative">
          <Image source={{ uri: post.thumbnailUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          <View className="absolute bottom-4 left-4 flex-row items-center rounded-full px-md py-1" style={{ backgroundColor: typeSpec.color }}>
            <Ionicons name={typeSpec.icon} size={14} color={colors.white} />
            <Text className="ml-xs text-caption font-bold text-white uppercase">{typeSpec.singular}</Text>
          </View>
        </View>
      )}

      {/* Detail Container */}
      <View className="px-xl pt-xl">
        {/* Caption & Title */}
        {!typeSpec.textFirst ? (
          <View className="mb-xl">
            <Text className="text-display text-navy">{post.title}</Text>
            <Text className="mt-xs text-body text-neutral-600" numberOfLines={expandedCaption ? undefined : 3}>
              {post.caption}
            </Text>
            {post.caption.length > 100 ? (
              <Pressable onPress={() => setExpandedCaption(!expandedCaption)} className="mt-xs self-start">
                <Text className="text-label font-semibold text-primary">
                  {expandedCaption ? 'Show less' : 'Show more'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Platform Metrics */}
        <FadeIn className="mb-xl">
          <Overline icon="pulse" color={bp.accent}>
            {bp.name} Performance Metrics
          </Overline>
          <View className="mt-md">
            <MetricStrip metrics={primaryMetrics} />
          </View>
          {secondaryMetrics.length > 0 ? (
            <View className="mt-md">
              <MetricStrip metrics={secondaryMetrics} />
            </View>
          ) : null}
        </FadeIn>

        {/* How this compares */}
        <FadeIn index={1} className="mb-2xl">
          <Text className="mb-md text-heading text-navy">How this compares</Text>
          <Text className={`mb-md text-display ${post.vsBenchmarkPercent >= 0 ? 'text-success' : 'text-warning'}`}>
            {post.vsBenchmarkPercent >= 0 ? `+${post.vsBenchmarkPercent}%` : `${post.vsBenchmarkPercent}%`} vs typical
          </Text>

          <PerformanceBar
            label={`This ${typeSpec.noun}`}
            value={formatMetric(itemBenchmarkVal as number, benchmarkMetricSpec.kind) ?? '0'}
            ratio={barMax > 0 ? (itemBenchmarkVal as number) / barMax : 0}
            color={bp.accent}
            emphasis
          />
          <PerformanceBar
            label={`Your typical ${bp.content.singular}`}
            value={formatMetric(typicalVal, benchmarkMetricSpec.kind) ?? '0'}
            ratio={barMax > 0 ? typicalVal / barMax : 0}
            color={colors.neutral300}
          />
          <Text className="mt-xs text-caption text-neutral-400">
            Compared on {bp.benchmark}. Typical = median post performance.
          </Text>
        </FadeIn>

        {/* Observed Factors */}
        <FadeIn index={2} className="mb-2xl">
          <Text className="mb-md text-heading text-navy">Observed Data</Text>
          <View className="rounded-2xl bg-neutral-50 p-lg">
            {post.observedFactors.map((fact) => (
              <View key={fact.label} className="flex-row items-center justify-between py-xs border-b border-neutral-200/60 last:border-0">
                <Text className="text-label text-neutral-500">{fact.label}</Text>
                <Text className="text-label font-semibold text-navy">{fact.value}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* AI UX Section */}
        <FadeIn index={3} className="mb-2xl">
          <Text className="mb-md text-heading text-navy">AI Analysis</Text>

          {/* AI Interpretation */}
          <View className="mb-md rounded-2xl bg-sky/30 border border-sky/50 p-lg">
            <View className="flex-row items-center">
              <Ionicons name="sparkles" size={18} color={bp.accent} />
              <Text className="ml-xs text-title text-navy">What the numbers show</Text>
            </View>
            <Text className="mt-xs text-body text-neutral-600">{post.aiAnalysis.interpretation}</Text>
          </View>

          {/* AI Hypothesis */}
          <View className="mb-md rounded-2xl bg-warning-light/40 border border-warning-light p-lg">
            <View className="flex-row items-center">
              <Ionicons name="bulb-outline" size={18} color={colors.warning} />
              <Text className="ml-xs text-title text-navy">
                {post.tier === 'top' ? 'Why it may have worked' : 'Possible reasons'}
              </Text>
            </View>
            {post.aiAnalysis.hypothesis.map((reason, idx) => (
              <View key={idx} className="mt-xs flex-row items-start">
                <Text className="mr-xs text-body text-warning">•</Text>
                <Text className="flex-1 text-body text-neutral-600">{reason}</Text>
              </View>
            ))}
          </View>

          {/* AI Suggestion / Actions */}
          <View className="rounded-2xl bg-success-light/40 border border-success-light p-lg">
            <View className="flex-row items-center">
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
              <Text className="ml-xs text-title text-navy">
                {post.tier === 'top' ? 'What to repeat' : post.tier === 'moderate' ? 'What to change' : 'What to try instead'}
              </Text>
            </View>
            {post.aiAnalysis.suggestions.map((action, idx) => (
              <View key={idx} className="mt-xs flex-row items-start">
                <Text className="mr-xs text-body text-success">•</Text>
                <Text className="flex-1 text-body text-neutral-600">{action}</Text>
              </View>
            ))}

            {post.aiAnalysis.stopSuggestions ? (
              <View className="mt-md border-t border-neutral-200 pt-sm">
                <Text className="text-label font-semibold text-danger">What to stop</Text>
                {post.aiAnalysis.stopSuggestions.map((stop, idx) => (
                  <View key={idx} className="mt-xs flex-row items-start">
                    <Text className="mr-xs text-body text-danger">•</Text>
                    <Text className="flex-1 text-body text-neutral-600">{stop}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </FadeIn>
      </View>
    </ScrollView>
  );
}
