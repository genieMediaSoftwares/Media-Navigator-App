import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformTierView } from '@/features/platforms/components/PlatformTierView';
import { SocialPlatform } from '@/types/api';

export default function PlatformLowRoute() {
  const router = useRouter();
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `Low ${bp.name} ${bp.content.plural}` }} />
      <PlatformTierView
        platform={platform}
        tier="low"
        onSelectPlatform={(p) => router.replace({ pathname: '/platforms/[platform]/low' as any, params: { platform: p } })}
      />
    </>
  );
}
