import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { AccountScreen } from '@/features/accounts/components/AccountScreen';
import { PLATFORMS } from '@/features/accounts/platforms';

/** Facebook, YouTube and LinkedIn account screens (Instagram has its own route). */
export default function PlatformAccountScreen() {
  const router = useRouter();
  const { platform: param } = useLocalSearchParams<{ platform: string }>();
  const platform = PLATFORMS.find((p) => p.id === param);
  if (!platform) {
    return (
      <View className="flex-1 bg-white p-xl">
        <EmptyState icon="help-circle-outline" title="Unknown platform" message="This platform is not supported." action={{ label: 'Connected accounts', onPress: () => router.replace('/connected-accounts') }} />
      </View>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: platform.name }} />
      <AccountScreen platform={platform.id} />
    </>
  );
}
