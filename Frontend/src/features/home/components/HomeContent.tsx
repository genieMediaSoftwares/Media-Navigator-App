import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn, PressableScale } from '@/components/visual/Motion';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { elevation } from '@/constants/theme';
import { platformOption } from '@/features/accounts/platforms';
import { describeChange, formatCompactNumber, formatPercent, NOT_AVAILABLE } from '@/lib/format';
import { ChannelSummary, HomeOverview, QuickInsight } from '@/types/api';

import { HeroSignalBanner } from './HeroSignalBanner';

type IconName = ComponentProps<typeof Ionicons>['name'];

function insightValue(insight: QuickInsight): string {
  return insight.unit === 'percent' ? formatPercent(insight.value) : formatCompactNumber(insight.value);
}

/** The primary channel as the screen's hero: handle, followers as the headline number, engagement. */
function ChannelHero({ channel, onOpen }: { channel: ChannelSummary; onOpen: () => void }) {
  const platform = platformOption(channel.platform);
  const change = channel.followersChangePercent === null ? null : describeChange(channel.followersChangePercent);
  return (
    <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${platform.name} @${channel.handle}. Opens Intelligence`} style={elevation.float}>
      <Gradient name="brand" style={{ borderRadius: 28, padding: 22 }}>
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.onDarkSubtle }}>
            <Ionicons name={platform.icon} size={18} color={colors.white} />
          </View>
          <View className="ml-sm flex-1">
            <Text className="text-label font-semibold text-white">@{channel.handle}</Text>
            <Text className="text-caption" style={{ color: colors.onDarkMuted }}>
              {platform.name}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={colors.white} />
        </View>
        <View className="mt-xl" accessible accessibilityLabel={`Followers: ${channel.followers === null ? NOT_AVAILABLE : formatCompactNumber(channel.followers)}`}>
          {channel.followers !== null ? (
            <Text className="text-hero text-white">{formatCompactNumber(channel.followers)}</Text>
          ) : (
            <Text className="text-heading" style={{ color: colors.onDarkMuted }}>
              {NOT_AVAILABLE}
            </Text>
          )}
          <Text className="text-label font-normal" style={{ color: colors.onDarkMuted }}>
            followers{change ? ` · ${change.direction === 'flat' ? 'unchanged' : change.text}` : ''}
          </Text>
        </View>
        <View className="my-lg h-px" style={{ backgroundColor: colors.onDarkSubtle }} />
        <View className="flex-row items-center justify-between">
          <Text className="text-label font-normal" style={{ color: colors.onDarkMuted }}>
            Avg engagement · latest 50 posts
          </Text>
          <Text className="text-title text-white">{channel.engagementRate === null ? NOT_AVAILABLE : formatPercent(channel.engagementRate, 2)}</Text>
        </View>
      </Gradient>
    </PressableScale>
  );
}

function Shortcut({ icon, label, tint, color, onPress }: { icon: IconName; label: string; tint: string; color: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="mr-md w-24 items-center">
      <View className="h-16 w-16 items-center justify-center rounded-3xl" style={{ backgroundColor: tint }}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text className="mt-sm text-center text-caption font-semibold text-navy" numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Home success state. Every value rendered here comes from GET /api/overview. */
export function HomeContent({ overview }: { overview: HomeOverview }) {
  const router = useRouter();
  const [primary, ...others] = overview.channels;
  const openIntelligence = () => router.navigate('/intelligence');

  return (
    <View>
      {overview.heroSignal ? <HeroSignalBanner signal={overview.heroSignal} /> : null}

      {primary ? (
        <FadeIn className="mb-2xl">
          <ChannelHero channel={primary} onOpen={openIntelligence} />
        </FadeIn>
      ) : (
        <Text className="mb-2xl text-body text-neutral-500">No channel data available yet.</Text>
      )}

      <FadeIn index={1} className="mb-2xl">
        <Overline className="mb-md">Jump to</Overline>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl" contentContainerClassName="px-xl">
          <Shortcut icon="sparkles" label="Intelligence" tint={colors.violetLight} color={colors.violet} onPress={openIntelligence} />
          <Shortcut icon="grid" label="Library" tint={colors.sky} color={colors.primaryBright} onPress={() => (primary ? router.push({ pathname: '/intelligence/library', params: { accountId: primary.accountId } }) : openIntelligence())} />
          <Shortcut icon="chatbubble-ellipses" label="Ask AI" tint={colors.magentaLight} color={colors.magenta} onPress={() => router.push({ pathname: '/intelligence/ask', params: { accountId: primary?.accountId ?? '' } })} />
          <Shortcut icon="calendar" label="Planner" tint={colors.cyanLight} color={colors.cyan} onPress={() => router.navigate('/planner')} />
          <Shortcut icon="logo-instagram" label="Account" tint={colors.neutral100} color={colors.navy} onPress={() => router.push('/connect/instagram')} />
        </ScrollView>
      </FadeIn>

      <FadeIn index={2} className="mb-2xl">
        <SectionTitle eyebrow="At a glance" eyebrowIcon="pulse" title="Your numbers" />
        {overview.insights.length === 0 ? (
          <Text className="text-body text-neutral-500">No insights available yet.</Text>
        ) : (
          <>
            <MetricStrip metrics={overview.insights.slice(0, 3).map((insight) => ({ label: insight.label.replace(/^Instagram /, ''), value: insightValue(insight) }))} />
            <Text className="mt-md text-center text-caption text-neutral-400">{overview.insights.slice(0, 3).map((i) => i.period).join(' · ')}</Text>
          </>
        )}
      </FadeIn>

      {others.length > 0 ? (
        <FadeIn index={3}>
          <SectionTitle title="Other channels" action={{ label: 'Manage', onPress: () => router.push('/connected-accounts') }} />
          {others.map((channel) => {
            const platform = platformOption(channel.platform);
            return (
              <View key={channel.accountId} className="flex-row items-center py-md" accessible>
                <Ionicons name={platform.icon} size={22} color={colors.navy} />
                <Text className="ml-md flex-1 text-body text-navy">@{channel.handle}</Text>
                <Text className="text-label text-navy">{formatCompactNumber(channel.followers)} followers</Text>
              </View>
            );
          })}
        </FadeIn>
      ) : (
        <Pressable onPress={() => router.push('/connected-accounts')} accessibilityRole="button" className="min-h-11 flex-row items-center justify-center">
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text className="ml-xs text-label font-semibold text-primary">Manage connected accounts</Text>
        </Pressable>
      )}
    </View>
  );
}
