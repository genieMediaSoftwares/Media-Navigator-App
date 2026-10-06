import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { colors, platformColors } from '@/constants/colors';
import { platformOption } from '@/features/accounts/platforms';
import { ConnectedAccount, SocialPlatform } from '@/types/api';

/** What each platform publishes, in its own vocabulary (card subtitle). */
export const PLATFORM_CONTENT_TYPES: Record<SocialPlatform, string> = {
  instagram: 'Posts, Reels, Stories',
  youtube: 'Videos, Shorts, Live',
  facebook: 'Posts, Videos, Reels',
  linkedin: 'Posts, Articles, Docs',
};

const CONNECT_PROMPT: Record<SocialPlatform, string> = {
  instagram: 'Connect your Instagram account to unlock analytics and insights.',
  youtube: 'Connect your YouTube channel to unlock analytics and insights.',
  facebook: 'Connect your Facebook Page to unlock analytics and insights.',
  linkedin: 'Connect your LinkedIn account to unlock analytics and insights.',
};

/** The platform's official logo on its brand color (Instagram keeps its gradient). */
export function PlatformLogoTile({ platform, size = 44 }: { platform: SocialPlatform; size?: number }) {
  return (
    <LinearGradient
      colors={platformColors[platform].logo}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{ width: size, height: size, borderRadius: size * 0.27, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={platformOption(platform).icon} size={size * 0.58} color={colors.white} />
    </LinearGradient>
  );
}

/** Card-sized number: one decimal below 100 (12.5K), none above (432K), so it fits a third of a card. */
export function cardNumber(value: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(value) >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}${suffix}`;
    }
  }
  return String(Math.round(value));
}

export interface PlatformCardMetrics {
  totalPosts: string | null;
  totalViews: string | null;
  engagementRate: string | null;
}

interface PlatformDashboardCardProps {
  platform: SocialPlatform;
  /** The connected account the backend returned for this platform; null = not connected. */
  account: ConnectedAccount | null;
  /** Real stored values (formatted); null = not provided by the platform; undefined = still loading. */
  metrics: PlatformCardMetrics | undefined;
  contentTypes?: string;
  onConnect: () => void;
  onManage: () => void;
  onViewAnalysis: () => void;
}

function StatusPill({ account }: { account: ConnectedAccount | null }) {
  const state = !account ? 'none' : account.status === 'connected' ? 'connected' : 'reconnect';
  const style = {
    connected: { bg: 'bg-success-light', fg: 'text-success', label: 'Connected' },
    reconnect: { bg: 'bg-warning-light', fg: 'text-warning', label: 'Reconnect' },
    none: { bg: 'bg-white/70', fg: 'text-neutral-500', label: 'Not connected' },
  }[state];
  return (
    <View className={`flex-row items-center rounded-full px-sm py-0.5 ${style.bg}`}>
      {state === 'connected' ? (
        <Ionicons name="checkmark-circle" size={11} color={colors.success} />
      ) : (
        <View className={`h-1.5 w-1.5 rounded-full ${state === 'reconnect' ? 'bg-warning' : 'bg-neutral-400'}`} />
      )}
      <Text className={`ml-1 text-[10px] font-medium ${style.fg}`} numberOfLines={1}>
        {style.label}
      </Text>
    </View>
  );
}

function Metric({ value, label, loading }: { value: string | null; label: string; loading: boolean }) {
  return (
    <View className="flex-1 items-center" accessible accessibilityLabel={`${label}: ${loading ? 'loading' : (value ?? 'Not available')}`}>
      {loading ? (
        <View className="my-0.5 h-4 w-8 rounded bg-neutral-100" />
      ) : value === null ? (
        <Text className="text-center text-[9px] leading-[11px] text-neutral-400" numberOfLines={2}>
          Not available
        </Text>
      ) : (
        <Text className="text-[14px] font-bold leading-[18px] text-navy" numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text className="mt-0.5 text-center text-[9px] leading-[12px] text-neutral-500" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function CardButton({ label, onPress, variant, disabled = false, grow }: { label: string; onPress: () => void; variant: 'outline' | 'primary'; disabled?: boolean; grow: number }) {
  const classes = disabled
    ? 'bg-neutral-200/80'
    : variant === 'primary'
      ? 'bg-primary active:bg-primary-dark'
      : 'border border-primary/30 bg-white active:bg-sky';
  const text = disabled ? 'text-white' : variant === 'primary' ? 'text-white' : 'text-primary';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ flex: grow }}
      className={`min-h-9 items-center justify-center rounded-lg ${classes}`}
    >
      <Text className={`text-[12.5px] font-semibold ${text}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One platform on the dashboard. Data-driven: "View Analysis" is enabled only when the backend
 * returned a connected account for the platform (an account needing reconnection still has stored
 * data to analyze, and says so). Metrics are real stored values or "Not available".
 */
export function PlatformDashboardCard({ platform, account, metrics, contentTypes, onConnect, onManage, onViewAnalysis }: PlatformDashboardCardProps) {
  const name = platformOption(platform).name;
  const tint = platformColors[platform];
  const connected = account !== null;

  return (
    <LinearGradient
      colors={tint.tint}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tint.border,
        padding: 10,
        shadowColor: colors.navy,
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      {/* Status sits in the top-right corner, above the platform name (as in the design). */}
      <View style={{ position: 'absolute', top: 8, right: 8 }}>
        <StatusPill account={account} />
      </View>
      <View className="mt-md flex-row items-center">
        <PlatformLogoTile platform={platform} size={34} />
        <View className="ml-sm flex-1">
          <Text className="text-[14px] font-bold leading-[18px] text-navy" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-[10px] leading-[14px] text-neutral-500" numberOfLines={1}>
            {contentTypes ?? PLATFORM_CONTENT_TYPES[platform]}
          </Text>
        </View>
      </View>

      <View className="flex-1 justify-center">
        {connected ? (
          <View className="my-sm flex-row border-y border-navy/5 py-sm">
            <Metric value={metrics?.totalPosts ?? null} label="Total Posts" loading={metrics === undefined} />
            <View className="w-px bg-navy/5" />
            <Metric value={metrics?.totalViews ?? null} label="Total Views" loading={metrics === undefined} />
            <View className="w-px bg-navy/5" />
            <Metric value={metrics?.engagementRate ?? null} label="Eng. Rate" loading={metrics === undefined} />
          </View>
        ) : (
          <View className="my-sm items-center">
            <View className="mb-xs h-8 w-8 items-center justify-center rounded-lg bg-white/80">
              <Ionicons name="bar-chart" size={16} color={colors.skyBorder} />
            </View>
            <Text className="text-center text-[10.5px] leading-[15px] text-neutral-500">{CONNECT_PROMPT[platform]}</Text>
          </View>
        )}
      </View>

      <View className="flex-row" style={{ gap: 6 }}>
        {connected ? (
          <CardButton label={account.status === 'connected' ? 'Manage' : 'Reconnect'} onPress={onManage} variant="outline" grow={0.8} />
        ) : (
          <CardButton label="Connect" onPress={onConnect} variant="outline" grow={0.8} />
        )}
        <CardButton label="View Analysis" onPress={onViewAnalysis} variant="primary" disabled={!connected} grow={1.2} />
      </View>
    </LinearGradient>
  );
}
