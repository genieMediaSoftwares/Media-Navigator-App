import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformContentLibraryView } from '@/features/platforms/components/PlatformContentLibraryView';
import { SocialPlatform } from '@/types/api';

export default function PlatformContentRoute() {
  const router = useRouter();
  const { platform: param = 'facebook' } = useLocalSearchParams<{ platform?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `${bp.name} ${bp.content.plural}` }} />
      <PlatformContentLibraryView
        platform={platform}
        onSelectPlatform={(p) => router.replace({ pathname: '/platforms/[platform]/content' as any, params: { platform: p } })}
      />
    </>
  );
}
