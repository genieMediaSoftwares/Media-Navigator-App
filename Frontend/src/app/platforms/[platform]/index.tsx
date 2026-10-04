import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformConnectedOverview } from '@/features/platforms/components/PlatformConnectedOverview';
import { SocialPlatform } from '@/types/api';

export default function PlatformOverviewScreen() {
  const router = useRouter();
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `${bp.name} ${bp.accountNoun}` }} />
      <PlatformConnectedOverview
        platform={platform}
        onSelectPlatform={(p) => router.replace({ pathname: '/platforms/[platform]/' as any, params: { platform: p } })}
      />
    </>
  );
}
