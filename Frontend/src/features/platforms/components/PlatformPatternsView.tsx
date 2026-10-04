import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { TrendBlock } from '@/features/intelligence/components/TrendBlock';
import { SocialPlatform } from '@/types/api';
import { blueprintOf } from '../blueprint';
import { getFixtureAccount } from '../fixtures';
import { PlatformHeader } from './PlatformHeader';

interface PlatformPatternsViewProps {
  platform: SocialPlatform;
  onSelectPlatform?: (platform: SocialPlatform) => void;
}

export function PlatformPatternsView({ platform, onSelectPlatform }: PlatformPatternsViewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);

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

      <Text className="text-heading text-navy">{bp.name} Pattern Analysis</Text>
      <Text className="mb-xl mt-xs text-label font-normal text-neutral-500">
        Strategic questions answered by studying your real {bp.name} {bp.content.plural}.
      </Text>

      {/* Blueprint Pattern Categories */}
      {bp.patterns.map((pat) => (
        <View key={pat.id} className="mb-lg rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm">
          <View className="flex-row items-center mb-xs">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 mr-sm">
              <Ionicons name={pat.icon} size={18} color={bp.accent} />
            </View>
            <Text className="text-title text-navy">{pat.title}</Text>
          </View>
          <Text className="mt-xs text-body font-semibold text-navy">{pat.question}</Text>
          <Text className="mt-xs text-caption text-neutral-500">Source: {pat.source}</Text>
        </View>
      ))}

      {/* Measured Trends */}
      <View className="mt-xl">
        <Text className="mb-md text-heading text-navy">Measured Findings</Text>
        <TrendBlock
          eyebrow="Primary Content Signal"
          kind="observed"
          title={`Top ${bp.content.plural} on ${bp.name} outperform by up to 3× average.`}
          body={`Measured across ${fix.contentCount} ${bp.content.plural} from @${fix.handle}.`}
        />
        <TrendBlock
          eyebrow="AI Pattern Interpretation"
          kind="aiSummary"
          title={`High visual clarity and concise messaging trigger stronger ${bp.name} feed recommendation.`}
          body={`AI hypothesis generated from your synced history on ${bp.name}.`}
          action={{
            label: 'View top content details',
            onPress: () => router.push({ pathname: '/platforms/[platform]/top' as any, params: { platform } }),
          }}
        />
      </View>
    </ScrollView>
  );
}
