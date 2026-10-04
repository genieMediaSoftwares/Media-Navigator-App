import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { ListRow } from '@/components/ListRow';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { Gradient } from '@/components/visual/Gradient';
import { MetricPill, MetricStrip } from '@/components/visual/Metrics';
import { FadeIn, PressableScale } from '@/components/visual/Motion';
import { SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { SocialPlatform } from '@/types/api';
import { blueprintOf, contentType, formatMetric } from '../blueprint';
import { getFixtureAccount } from '../fixtures';
import { PlatformHeader } from './PlatformHeader';
import { PlatformSelector } from './PlatformSelector';

interface PlatformConnectedOverviewProps {
  platform: SocialPlatform;
  onSelectPlatform: (platform: SocialPlatform) => void;
}

export function PlatformConnectedOverview({ platform, onSelectPlatform }: PlatformConnectedOverviewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const topPost = fix.posts.find((p) => p.tier === 'top') ?? fix.posts[0];
  const postType = topPost ? contentType(bp, topPost.contentTypeId) : bp.contentTypes[0];

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="pb-3xl"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Platform Switcher Bar */}
      <View className="px-xl pt-md">
        <PlatformSelector selectedPlatform={platform} onSelectPlatform={onSelectPlatform} />
      </View>

      {/* Profile Hero */}
      <Gradient name="canvas" direction="vertical" style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28 }}>
        <FadeIn className="items-center">
          <PlatformHeader
            platform={platform}
            handle={fix.handle}
            displayName={fix.displayName}
            profilePictureUrl={fix.profilePictureUrl}
            syncedPostsCount={fix.contentCount}
            onSelectPlatform={onSelectPlatform}
          />

          <View className="mt-xs flex-row items-center">
            <View className="flex-row items-center rounded-full bg-success-light px-md py-1">
              <View className="mr-xs h-2 w-2 rounded-full bg-success" />
              <Text className="text-caption font-semibold text-success">Connected</Text>
            </View>
            <Text className="ml-sm text-caption text-neutral-500">Synced 2h ago</Text>
          </View>

          {/* Main Action Buttons */}
          <View className="mt-xl flex-row items-center self-stretch">
            <PressableScale
              onPress={() => router.push({ pathname: '/platforms/[platform]/intelligence' as any, params: { platform } })}
              accessibilityRole="button"
              className="flex-1"
            >
              <Gradient name="brand" direction="horizontal" style={{ borderRadius: 999, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={18} color={colors.white} />
                <Text className="ml-sm text-body font-semibold text-white">Analyze Intelligence</Text>
              </Gradient>
            </PressableScale>
            <Pressable
              onPress={() => router.push({ pathname: '/platforms/[platform]/formats' as any, params: { platform } })}
              accessibilityRole="button"
              className="ml-sm h-[50px] w-[50px] items-center justify-center rounded-full bg-white active:bg-neutral-100"
            >
              <Ionicons name="layers-outline" size={20} color={bp.accent} />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/platforms/[platform]/patterns' as any, params: { platform } })}
              accessibilityRole="button"
              className="ml-sm h-[50px] w-[50px] items-center justify-center rounded-full bg-white active:bg-neutral-100"
            >
              <Ionicons name="trending-up-outline" size={20} color={colors.navy} />
            </Pressable>
          </View>
        </FadeIn>
      </Gradient>

      <View className="px-xl pt-lg">
        {/* Account Snapshot Metrics */}
        <FadeIn index={1} className="mb-xl">
          <MetricStrip
            metrics={[
              { label: bp.audienceLabel, value: formatCompactNumber(fix.audienceCount) },
              { label: bp.content.plural, value: formatCompactNumber(fix.contentCount) },
              { label: 'Avg engagement', value: formatPercent(fix.avgEngagementRate, 1), accent: bp.accent },
            ]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mt-md" contentContainerClassName="px-xl">
            {bp.metrics.slice(0, 5).map((m) => {
              const val = topPost?.metrics[m.key] ?? null;
              const formatted = formatMetric(val, m.kind);
              return <MetricPill key={m.key} icon="stats-chart-outline" label={m.label.toLowerCase()} value={formatted} />;
            })}
          </ScrollView>
        </FadeIn>

        {/* Top Content Highlight */}
        {topPost ? (
          <FadeIn index={2} className="mb-2xl">
            <SectionTitle title={`Top performing ${bp.content.singular}`} />
            <Pressable
              onPress={() => router.push({ pathname: '/platforms/[platform]/detail' as any, params: { platform, id: topPost.id } })}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm active:bg-neutral-50"
            >
              <View className="p-lg">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center rounded-full px-md py-1" style={{ backgroundColor: postType.light }}>
                    <Ionicons name={postType.icon} size={14} color={postType.color} />
                    <Text className="ml-xs text-caption font-bold" style={{ color: postType.color }}>
                      {postType.singular}
                    </Text>
                  </View>
                  <View className="rounded-full bg-success-light px-md py-1">
                    <Text className="text-caption font-bold text-success">
                      +{topPost.vsBenchmarkPercent}% vs typical
                    </Text>
                  </View>
                </View>

                <Text className="mt-md text-title text-navy" numberOfLines={2}>
                  {topPost.title}
                </Text>
                <Text className="mt-xs text-body text-neutral-500" numberOfLines={2}>
                  {topPost.caption}
                </Text>

                <View className="mt-md flex-row items-center justify-between border-t border-neutral-100 pt-md">
                  {bp.cardMetrics.map((k) => {
                    const spec = bp.metrics.find((m) => m.key === k);
                    if (!spec) return null;
                    const val = topPost.metrics[k];
                    return (
                      <View key={k} className="items-center">
                        <Text className="text-caption text-neutral-400">{spec.label}</Text>
                        <Text className="text-label font-bold text-navy">{formatMetric(val, spec.kind) ?? 'N/A'}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </Pressable>
          </FadeIn>
        ) : null}

        {/* Deep Navigation Section */}
        <FadeIn index={3} className="mb-2xl">
          <Text className="mb-sm px-xs text-caption font-semibold uppercase tracking-wide text-neutral-500">
            {bp.name} Intelligence
          </Text>
          <View className="overflow-hidden rounded-2xl bg-neutral-50">
            <ListRow
              icon="sparkles-outline"
              label={`Why ${bp.content.plural} work on ${bp.name}`}
              onPress={() => router.push({ pathname: '/platforms/[platform]/intelligence' as any, params: { platform } })}
            />
            <Divider inset />
            <ListRow
              icon="layers-outline"
              label={`Format performance (${bp.contentTypes.map((ct) => ct.plural).slice(0, 3).join(', ')})`}
              onPress={() => router.push({ pathname: '/platforms/[platform]/formats' as any, params: { platform } })}
            />
            <Divider inset />
            <ListRow
              icon="trending-up-outline"
              label={`${bp.name} pattern analysis`}
              onPress={() => router.push({ pathname: '/platforms/[platform]/patterns' as any, params: { platform } })}
            />
            <Divider inset />
            <ListRow
              icon="grid-outline"
              label={`All ${fix.contentCount} synced ${bp.content.plural}`}
              onPress={() => router.push({ pathname: '/platforms/[platform]/content' as any, params: { platform } })}
            />
          </View>
        </FadeIn>

        <Button
          title="Analyze Intelligence"
          icon="sparkles-outline"
          onPress={() => router.push({ pathname: '/platforms/[platform]/intelligence' as any, params: { platform } })}
        />
        <View className="mt-sm">
          <Button
            title="Connected Accounts"
            icon="settings-outline"
            variant="secondary"
            onPress={() => router.push('/connected-accounts')}
          />
        </View>
      </View>
    </ScrollView>
  );
}
