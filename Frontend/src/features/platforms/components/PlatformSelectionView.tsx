import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { fetchPendingSelection, selectPendingAccount } from '@/features/accounts/api';
import { SocialPlatform } from '@/types/api';
import { blueprintOf } from '../blueprint';
import { getFixtureAccount } from '../fixtures';

interface PlatformSelectionViewProps {
  platform: SocialPlatform;
  selectionId?: string;
}

export function PlatformSelectionView({ platform, selectionId }: PlatformSelectionViewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);

  const [loadingSelection, setLoadingSelection] = useState(Boolean(selectionId));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [options, setOptions] = useState<Array<{ platformAccountId: string; accountName: string | null; accountUsername: string; profilePictureUrl: string | null }>>(
    fix.pendingOptions ?? [
      {
        platformAccountId: 'opt-1',
        accountName: fix.displayName,
        accountUsername: fix.handle,
        profilePictureUrl: fix.profilePictureUrl,
      },
    ]
  );

  const [selectedId, setSelectedId] = useState<string>('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!selectionId) return;
    let mounted = true;
    setLoadingSelection(true);
    fetchPendingSelection(selectionId)
      .then((res) => {
        if (!mounted) return;
        setOptions(res.options);
        if (res.options[0]) setSelectedId(res.options[0].platformAccountId);
      })
      .catch((err) => {
        if (!mounted) return;
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load accounts.');
      })
      .finally(() => {
        if (mounted) setLoadingSelection(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectionId]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setConnecting(true);
    try {
      if (selectionId) {
        await selectPendingAccount(selectionId, selectedId);
      }
      router.replace({ pathname: '/platforms/[platform]/' as any, params: { platform } });
    } catch (err) {
      Alert.alert(`Unable to connect ${bp.accountNoun}`, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  if (loadingSelection) return <LoadingState message={`Loading ${bp.name} ${bp.accountNoun.toLowerCase()}s…`} />;
  if (errorMsg) return <ErrorState message={errorMsg} onRetry={() => router.replace('/connected-accounts')} />;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-lg">
      <FadeIn>
        <Overline className="mb-sm">{bp.name} connection</Overline>
        <Text className="text-display text-navy">{bp.selectTitle}</Text>
        <Text className="mb-xl mt-xs text-body text-neutral-500">{bp.selectHint}</Text>

        <View className="mb-2xl rounded-2xl border border-neutral-200 p-md">
          {options.map((opt) => {
            const isSelected = opt.platformAccountId === selectedId;
            return (
              <Pressable
                key={opt.platformAccountId}
                onPress={() => setSelectedId(opt.platformAccountId)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                className={`mb-sm flex-row items-center rounded-xl p-md ${
                  isSelected ? 'bg-sky/30 border border-primaryBright' : 'bg-neutral-50'
                }`}
              >
                <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-neutral-200">
                  {opt.profilePictureUrl ? (
                    <Image source={{ uri: opt.profilePictureUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name={bp.icon} size={24} color={bp.accent} />
                  )}
                </View>
                <View className="ml-md flex-1">
                  <Text className="text-body font-semibold text-navy">{opt.accountName || opt.accountUsername}</Text>
                  <Text className="text-caption text-neutral-500">
                    @{opt.accountUsername} · {bp.accountNoun}
                  </Text>
                </View>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={isSelected ? colors.primaryBright : colors.neutral300}
                />
              </Pressable>
            );
          })}
        </View>

        <Button
          title={connecting ? `Connecting ${bp.accountNoun}…` : `Connect Selected ${bp.accountNoun}`}
          onPress={handleConfirm}
          loading={connecting}
          disabled={!selectedId}
        />
      </FadeIn>
    </ScrollView>
  );
}
