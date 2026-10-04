import { Stack, useLocalSearchParams } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformDetailView } from '@/features/platforms/components/PlatformDetailView';
import { SocialPlatform } from '@/types/api';

export default function PlatformDetailRoute() {
  const { platform: param = 'facebook', id } = useLocalSearchParams<{ platform?: string; id?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: `${bp.name} ${bp.content.singular} detail` }} />
      <PlatformDetailView platform={platform} postId={id} />
    </>
  );
}
