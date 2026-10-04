import { Stack, useLocalSearchParams } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformConnectView } from '@/features/platforms/components/PlatformConnectView';
import { SocialPlatform } from '@/types/api';

export default function PlatformConnectRoute() {
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `Connect ${bp.name}` }} />
      <PlatformConnectView platform={platform} />
    </>
  );
}
