import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Gradient } from '@/components/visual/Gradient';
import { colors } from '@/constants/colors';
import { SocialPlatform } from '@/types/api';
import { BLUEPRINTS, blueprintOf } from '../blueprint';
import { getFixtureAccount } from '../fixtures';

interface PlatformHeaderProps {
  platform: SocialPlatform;
  handle: string;
  displayName?: string | null;
  profilePictureUrl?: string | null;
  syncedPostsCount?: number;
  lastSyncedAt?: string | null;
  onSelectPlatform?: (platform: SocialPlatform) => void;
}

export function PlatformHeader({
  platform,
  handle,
  displayName,
  profilePictureUrl,
  syncedPostsCount = 0,
  lastSyncedAt,
  onSelectPlatform,
}: PlatformHeaderProps) {
  const [open, setOpen] = useState(false);
  const bp = blueprintOf(platform);

  return (
    <View className="mb-xl flex-row items-center">
      {/* Avatar with platform badge */}
      <View className="relative">
        <Gradient name="ai" style={{ width: 48, height: 48, borderRadius: 24, padding: 2 }}>
          <View className="flex-1 items-center justify-center overflow-hidden rounded-full bg-white">
            {profilePictureUrl ? (
              <Image source={{ uri: profilePictureUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Ionicons name={bp.icon} size={22} color={bp.accent} />
            )}
          </View>
        </Gradient>
        <View
          className="absolute -bottom-1 -right-1 h-5 w-5 items-center justify-center rounded-full border border-white"
          style={{ backgroundColor: bp.accent }}
        >
          <Ionicons name={bp.icon} size={11} color={colors.white} />
        </View>
      </View>

      <View className="ml-md flex-1">
        <Pressable
          onPress={onSelectPlatform ? () => setOpen(true) : undefined}
          disabled={!onSelectPlatform}
          className="flex-row items-center self-start"
        >
          <Text className="text-title text-navy" numberOfLines={1}>
            @{handle}
          </Text>
          {onSelectPlatform ? <Ionicons name="chevron-down" size={16} color={colors.neutral500} style={{ marginLeft: 4 }} /> : null}
        </Pressable>
        <Text className="text-caption text-neutral-500" numberOfLines={1}>
          {bp.name} {bp.accountNoun} · {syncedPostsCount} {bp.content.plural} analyzed
        </Text>
      </View>

      {onSelectPlatform ? (
        <BottomSheet visible={open} onClose={() => setOpen(false)} title="Switch Platform / Account">
          <View className="-mx-lg">
            {(['instagram', 'facebook', 'youtube', 'linkedin'] as const).map((pId) => {
              const b = BLUEPRINTS[pId];
              const fix = getFixtureAccount(pId);
              const isCurrent = pId === platform;
              return (
                <Pressable
                  key={pId}
                  onPress={() => {
                    setOpen(false);
                    onSelectPlatform(pId);
                  }}
                  className={`flex-row items-center p-lg active:bg-neutral-50 ${isCurrent ? 'bg-neutral-50' : ''}`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                    <Ionicons name={b.icon} size={20} color={b.accent} />
                  </View>
                  <View className="ml-md flex-1">
                    <Text className="text-body font-semibold text-navy">{b.name}</Text>
                    <Text className="text-caption text-neutral-500">
                      @{fix.handle} · {b.accountNoun}
                    </Text>
                  </View>
                  {isCurrent ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
}
