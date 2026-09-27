import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Gradient } from '@/components/visual/Gradient';
import { colors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { formatRelativeTime } from '@/lib/format';
import { IntelligenceAccount } from '@/types/api';

/** Profile picture inside a gradient ring; falls back to the platform icon. */
export function AccountAvatar({ account, size }: { account: IntelligenceAccount; size: number }) {
  const ring = Math.max(2, Math.round(size / 18));
  return (
    <Gradient name="ai" style={{ width: size, height: size, borderRadius: size / 2, padding: ring }}>
      <View className="flex-1 items-center justify-center overflow-hidden rounded-full bg-white" style={{ padding: ring }}>
        {account.profilePictureUrl ? (
          <Image source={{ uri: account.profilePictureUrl }} style={{ width: '100%', height: '100%', borderRadius: size }} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <Ionicons name={platformOption(account.platform).icon} size={size * 0.42} color={colors.navy} />
        )}
      </View>
    </Gradient>
  );
}

interface AccountHeaderProps {
  account: IntelligenceAccount;
  accounts: IntelligenceAccount[];
  syncedPosts: number;
  onSelect: (accountId: string) => void;
}

/** Account selector + one-line summary. Lists only accounts the backend returned. */
export function AccountHeader({ account, accounts, syncedPosts, onSelect }: AccountHeaderProps) {
  const [open, setOpen] = useState(false);
  const canSwitch = accounts.length > 1;
  const platform = platformOption(account.platform);

  return (
    <View className="mb-xl flex-row items-center">
      <AccountAvatar account={account} size={44} />
      <View className="ml-md flex-1">
        <Pressable
          onPress={canSwitch ? () => setOpen(true) : undefined}
          disabled={!canSwitch}
          accessibilityRole={canSwitch ? 'button' : undefined}
          accessibilityLabel={`${platform.name} account @${account.handle}${canSwitch ? '. Change account' : ''}`}
          className="min-h-6 flex-row items-center self-start"
        >
          <Text className="text-title text-navy" numberOfLines={1}>
            @{account.handle}
          </Text>
          {canSwitch ? <Ionicons name="chevron-down" size={16} color={colors.neutral500} style={{ marginLeft: 4 }} /> : null}
        </Pressable>
        <Text className="text-caption text-neutral-500" numberOfLines={1}>
          {platform.name} · {syncedPosts} posts analyzed · synced {formatRelativeTime(account.lastSyncedAt).toLowerCase()}
        </Text>
      </View>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Accounts">
        {accounts.map((option) => {
          const supported = option.platform === 'instagram';
          const selected = option.id === account.id;
          const optionPlatform = platformOption(option.platform);
          return (
            <Pressable
              key={option.id}
              disabled={!supported}
              onPress={() => {
                setOpen(false);
                if (!selected) onSelect(option.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !supported }}
              accessibilityLabel={`${optionPlatform.name} @${option.handle}${supported ? '' : ', intelligence not available yet'}`}
              className="min-h-16 flex-row items-center active:bg-neutral-50"
            >
              <AccountAvatar account={option} size={40} />
              <View className="ml-md flex-1">
                <Text className={`text-body ${supported ? 'text-navy' : 'text-neutral-500'}`}>@{option.handle}</Text>
                <Text className="text-caption text-neutral-500">{supported ? optionPlatform.name : `${optionPlatform.name} · Intelligence not available yet`}</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}
