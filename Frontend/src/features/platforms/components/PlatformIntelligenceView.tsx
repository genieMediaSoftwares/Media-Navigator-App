import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { colors } from '@/constants/colors';
import { formatCompactNumber } from '@/lib/format';
import { SocialPlatform } from '@/types/api';
import { ANALYSIS_SECTIONS, blueprintOf, contentType, formatMetric, Tier, TIER_LABELS } from '../blueprint';
import { getFixtureAccount } from '../fixtures';
import { PlatformHeader } from './PlatformHeader';
import { PlatformSelector } from './PlatformSelector';

interface PlatformIntelligenceViewProps {
  platform: SocialPlatform;
  initialTier?: Tier;
  onSelectPlatform?: (platform: SocialPlatform) => void;
}

export function PlatformIntelligenceView({
  platform,
  initialTier = 'top',
  onSelectPlatform,
}: PlatformIntelligenceViewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);

  const [activeTier, setActiveTier] = useState<Tier>(initialTier);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const filteredPosts = fix.posts.filter((p) => {
    const tierMatch = p.tier === activeTier;
    const typeMatch = !selectedTypeId || p.contentTypeId === selectedTypeId;
    return tierMatch && typeMatch;
  });

  const displayPost = filteredPosts[0] ?? fix.posts[0];
  const activeTypeSpec = displayPost ? contentType(bp, displayPost.contentTypeId) : bp.contentTypes[0];

  const tierQuestion = bp.question(activeTier, activeTypeSpec);
  const analysisBlocks = ANALYSIS_SECTIONS[activeTier];

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-md">
      {/* Platform Switcher */}
      {onSelectPlatform ? (
        <PlatformSelector selectedPlatform={platform} onSelectPlatform={onSelectPlatform} />
      ) : null}

      <PlatformHeader
        platform={platform}
        handle={fix.handle}
        displayName={fix.displayName}
        profilePictureUrl={fix.profilePictureUrl}
        syncedPostsCount={fix.contentCount}
        onSelectPlatform={onSelectPlatform}
      />

      {/* Summary */}
      <FadeIn className="mb-xl">
        <Text className="text-display text-navy">{fix.contentCount} {bp.content.plural} analyzed</Text>
        <Text className="mt-xs text-label font-normal text-neutral-500">
          studying your real {bp.name} history by {bp.benchmark}.
        </Text>
        <View className="mt-md">
          <MetricStrip
            metrics={[
              { label: bp.audienceLabel, value: formatCompactNumber(fix.audienceCount) },
              { label: bp.content.plural, value: formatCompactNumber(fix.contentCount) },
              { label: 'Avg engagement', value: `${fix.avgEngagementRate}%`, accent: bp.accent },
            ]}
          />
        </View>
      </FadeIn>

      {/* Top / Moderate / Low Segmented Switch */}
      <FadeIn index={1} className="mb-xl">
        <SegmentedControl
          segments={[
            { value: 'top', label: TIER_LABELS.top.label },
            { value: 'moderate', label: TIER_LABELS.moderate.label },
            { value: 'low', label: TIER_LABELS.low.label },
          ]}
          value={activeTier}
          onChange={(v) => setActiveTier(v as Tier)}
        />

        <Text className="mb-xs mt-lg text-heading text-navy">{TIER_LABELS[activeTier].title}</Text>
        <Text className="mb-md text-label font-normal text-neutral-500">{tierQuestion}</Text>

        {/* Format Chips Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-lg" contentContainerClassName="px-xl">
          <Pressable
            onPress={() => setSelectedTypeId(null)}
            className={`mr-sm flex-row items-center rounded-full px-lg py-sm ${
              selectedTypeId === null ? 'bg-navy' : 'bg-neutral-100'
            }`}
          >
            <Text className={`text-label ${selectedTypeId === null ? 'font-semibold text-white' : 'text-navy'}`}>All</Text>
          </Pressable>

          {bp.contentTypes.map((ct) => {
            const isSelected = ct.id === selectedTypeId;
            return (
              <Pressable
                key={ct.id}
                onPress={() => setSelectedTypeId(ct.id)}
                className={`mr-sm flex-row items-center rounded-full px-lg py-sm ${
                  isSelected ? 'bg-navy' : 'bg-neutral-100'
                }`}
              >
                <View className="mr-xs h-2 w-2 rounded-full" style={{ backgroundColor: ct.color }} />
                <Text className={`text-label ${isSelected ? 'font-semibold text-white' : 'text-navy'}`}>{ct.plural}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Content Cards */}
        {filteredPosts.length === 0 ? (
          <View className="rounded-2xl bg-neutral-50 p-xl items-center justify-center">
            <Ionicons name="documents-outline" size={32} color={colors.neutral400} />
            <Text className="mt-sm text-label text-neutral-500">No {activeTypeSpec.nounPlural} in {activeTier} tier yet.</Text>
          </View>
        ) : (
          filteredPosts.map((post) => {
            const typeSpec = contentType(bp, post.contentTypeId);
            return (
              <Pressable
                key={post.id}
                onPress={() => router.push({ pathname: '/platforms/[platform]/detail' as any, params: { platform, id: post.id } })}
                className="mb-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white p-lg active:bg-neutral-50"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center rounded-full px-md py-1" style={{ backgroundColor: typeSpec.light }}>
                    <Ionicons name={typeSpec.icon} size={14} color={typeSpec.color} />
                    <Text className="ml-xs text-caption font-bold" style={{ color: typeSpec.color }}>
                      {typeSpec.singular}
                    </Text>
                  </View>
                  <Text className={`text-caption font-bold ${post.vsBenchmarkPercent >= 0 ? 'text-success' : 'text-warning'}`}>
                    {post.vsBenchmarkPercent >= 0 ? `+${post.vsBenchmarkPercent}%` : `${post.vsBenchmarkPercent}%`} vs typical
                  </Text>
                </View>

                <Text className="mt-md text-title text-navy" numberOfLines={2}>{post.title}</Text>
                <Text className="mt-xs text-body text-neutral-500" numberOfLines={2}>{post.caption}</Text>

                {/* Card metrics from blueprint */}
                <View className="mt-md flex-row items-center justify-between border-t border-neutral-100 pt-md">
                  {bp.cardMetrics.map((k) => {
                    const spec = bp.metrics.find((m) => m.key === k);
                    if (!spec) return null;
                    const val = post.metrics[k];
                    return (
                      <View key={k} className="items-center">
                        <Text className="text-caption text-neutral-400">{spec.label}</Text>
                        <Text className="text-label font-semibold text-navy">{formatMetric(val, spec.kind) ?? 'N/A'}</Text>
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            );
          })
        )}
      </FadeIn>

      {/* Structured AI Analysis Blocks Overview */}
      <FadeIn index={2} className="mt-lg">
        <Text className="mb-md text-heading text-navy">AI Intelligence Model</Text>
        {analysisBlocks.map((block) => (
          <View key={block.title} className="mb-md rounded-2xl bg-neutral-50 p-lg">
            <View className="flex-row items-center">
              <Ionicons
                name={block.kind === 'observed' ? 'stats-chart' : block.kind === 'aiSummary' ? 'sparkles' : 'bulb'}
                size={18}
                color={bp.accent}
              />
              <Text className="ml-sm text-title text-navy">{block.title}</Text>
            </View>
            <Text className="mt-xs text-body text-neutral-500">{block.placeholder}</Text>
          </View>
        ))}
      </FadeIn>
    </ScrollView>
  );
}
