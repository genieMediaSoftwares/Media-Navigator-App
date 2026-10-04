import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformPatternsView } from '@/features/platforms/components/PlatformPatternsView';
import { SocialPlatform } from '@/types/api';

export default function PlatformPatternsRoute() {
  const router = useRouter();
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `${bp.name} Patterns` }} />
      <PlatformPatternsView
        platform={platform}
        onSelectPlatform={(p) => router.replace({ pathname: '/platforms/[platform]/patterns' as any, params: { platform: p } })}
      />
    </>
  );
}
