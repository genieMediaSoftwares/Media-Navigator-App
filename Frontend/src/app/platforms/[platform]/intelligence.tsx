import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformIntelligenceView } from '@/features/platforms/components/PlatformIntelligenceView';
import { SocialPlatform } from '@/types/api';

export default function PlatformIntelligenceRoute() {
  const router = useRouter();
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `${bp.name} Intelligence` }} />
      <PlatformIntelligenceView
        platform={platform}
        onSelectPlatform={(p) => router.replace({ pathname: '/platforms/[platform]/intelligence' as any, params: { platform: p } })}
      />
    </>
  );
}
