import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformFormatsView } from '@/features/platforms/components/PlatformFormatsView';
import { SocialPlatform } from '@/types/api';

export default function PlatformFormatsRoute() {
  const router = useRouter();
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `${bp.name} Formats` }} />
      <PlatformFormatsView
        platform={platform}
        onSelectPlatform={(p) => router.replace({ pathname: '/platforms/[platform]/formats' as any, params: { platform: p } })}
      />
    </>
  );
}
