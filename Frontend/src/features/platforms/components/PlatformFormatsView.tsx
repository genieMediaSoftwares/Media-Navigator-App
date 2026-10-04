import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { SocialPlatform } from '@/types/api';
import { blueprintOf, contentType, formatMetric } from '../blueprint';
import { getFixtureAccount } from '../fixtures';
import { PlatformHeader } from './PlatformHeader';

interface PlatformFormatsViewProps {
  platform: SocialPlatform;
  onSelectPlatform?: (platform: SocialPlatform) => void;
}

export function PlatformFormatsView({ platform, onSelectPlatform }: PlatformFormatsViewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);

  const [selectedTypeId, setSelectedTypeId] = useState<string>(bp.contentTypes[0].id);

  const activeSpec = contentType(bp, selectedTypeId);
  const matchingPosts = fix.posts.filter((p) => p.contentTypeId === selectedTypeId);
  const samplePost = matchingPosts[0] ?? fix.posts[0];

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-md">
      <PlatformHeader
        platform={platform}
        handle={fix.handle}
        displayName={fix.displayName}
        profilePictureUrl={fix.profilePictureUrl}
        syncedPostsCount={fix.contentCount}
        onSelectPlatform={onSelectPlatform}
      />

      <FadeIn className="mb-xl">
        <Text className="text-heading text-navy">Which {bp.name} formats work best</Text>
        <Text className="mt-xs text-label font-normal text-neutral-500">
          Native format distribution for your {bp.name} {bp.accountNoun.toLowerCase()}.
        </Text>
      </FadeIn>

      {/* Native Format Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-xl" contentContainerClassName="px-xl">
        {bp.contentTypes.map((ct) => {
          const isSelected = ct.id === selectedTypeId;
          return (
            <Pressable
              key={ct.id}
              onPress={() => setSelectedTypeId(ct.id)}
              className={`mr-sm flex-row items-center rounded-full px-lg py-md ${
                isSelected ? 'bg-navy' : 'bg-neutral-100'
              }`}
            >
              <View className="mr-xs h-2 w-2 rounded-full" style={{ backgroundColor: ct.color }} />
              <Ionicons name={ct.icon} size={16} color={isSelected ? '#fff' : ct.color} style={{ marginRight: 4 }} />
              <Text className={`text-label ${isSelected ? 'font-semibold text-white' : 'text-navy'}`}>{ct.plural}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Active Format Breakdown */}
      <FadeIn key={selectedTypeId} className="mb-2xl">
        <View className="flex-row items-center mb-md">
          <View className="h-10 w-10 items-center justify-center rounded-xl mr-md" style={{ backgroundColor: activeSpec.light }}>
            <Ionicons name={activeSpec.icon} size={22} color={activeSpec.color} />
          </View>
          <View>
            <Text className="text-display" style={{ color: activeSpec.color }}>{activeSpec.plural}</Text>
            <Text className="text-caption text-neutral-500">Native {bp.name} {activeSpec.singular.toLowerCase()} analytics</Text>
          </View>
        </View>

        {/* Format metrics */}
        <MetricStrip
          metrics={[
            { label: 'Published', value: String(matchingPosts.length) },
            {
              label: `Avg ${bp.cardMetrics[0] || 'views'}`,
              value: samplePost ? formatMetric(samplePost.metrics[bp.cardMetrics[0]] ?? null, 'count') ?? 'N/A' : 'N/A',
            },
            {
              label: 'Avg engagement',
              value: samplePost ? formatMetric(samplePost.metrics.engagementRate ?? null, 'percent') ?? 'N/A' : 'N/A',
              accent: activeSpec.color,
            },
          ]}
        />

        <View className="mt-xl rounded-2xl bg-neutral-50 p-lg">
          <Text className="text-title text-navy">Format performance pattern</Text>
          <Text className="mt-xs text-body text-neutral-600">
            {activeSpec.plural} represent key opportunities on {bp.name}. Your top {activeSpec.singular.toLowerCase()} achieved +{samplePost?.vsBenchmarkPercent ?? 120}% higher performance than your median {bp.content.singular}.
          </Text>
        </View>

        {/* Example Content Item */}
        {samplePost ? (
          <View className="mt-xl">
            <Text className="mb-md text-title text-navy">Top example in {activeSpec.plural}</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/platforms/[platform]/detail' as any, params: { platform, id: samplePost.id } })}
              className="rounded-2xl border border-neutral-200 bg-white p-lg active:bg-neutral-50"
            >
              <Text className="text-title text-navy">{samplePost.title}</Text>
              <Text className="mt-xs text-body text-neutral-500" numberOfLines={2}>{samplePost.caption}</Text>
            </Pressable>
          </View>
        ) : null}
      </FadeIn>
    </ScrollView>
  );
}
