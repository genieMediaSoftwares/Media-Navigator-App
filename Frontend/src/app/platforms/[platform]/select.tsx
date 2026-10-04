import { Stack, useLocalSearchParams } from 'expo-router';

import { blueprintOf } from '@/features/platforms/blueprint';
import { PlatformSelectionView } from '@/features/platforms/components/PlatformSelectionView';
import { SocialPlatform } from '@/types/api';

export default function PlatformSelectRoute() {
  const { platform: param = 'facebook', selectionId } = useLocalSearchParams<{ platform?: string; selectionId?: string }>();
  const platform: SocialPlatform = (param as SocialPlatform) || 'facebook';
  const bp = blueprintOf(platform);

  return (
    <>
      <Stack.Screen options={{ title: bp.selectTitle }} />
      <PlatformSelectionView platform={platform} selectionId={selectionId} />
    </>
  );
}
