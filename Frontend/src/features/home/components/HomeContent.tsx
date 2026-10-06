import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { accountHref } from '@/features/accounts/platforms';
import { fetchDashboard } from '@/features/analysis/api';
import { ResourceState } from '@/hooks/useApiResource';
import { formatPercent } from '@/lib/format';
import { ConnectedAccount, SocialPlatform } from '@/types/api';

import { cardNumber, PlatformCardMetrics, PlatformDashboardCard } from './PlatformDashboardCard';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Grid order, as in the design: Instagram · YouTube / Facebook · LinkedIn. */
const GRID: SocialPlatform[][] = [
  ['instagram', 'youtube'],
  ['facebook', 'linkedin'],
];

/** The account each platform card represents: the first one the backend returned for that platform. */
function accountFor(accounts: ConnectedAccount[], platform: SocialPlatform): ConnectedAccount | null {
  return accounts.find((a) => a.platform === platform) ?? null;
}

/** Real stored totals for each connected account (total posts / views / engagement rate). */
function useCardMetrics(accounts: ConnectedAccount[]) {
  const [metrics, setMetrics] = useState<Record<string, PlatformCardMetrics>>({});
  const key = accounts.map((a) => `${a.id}:${a.lastSyncedAt ?? ''}`).join(',');
  useEffect(() => {
    let active = true;
    for (const account of accounts) {
      fetchDashboard(account.id).then(
        (res) => {
          const s = res.dashboard?.summary;
          if (!active || !s) return;
          setMetrics((prev) => ({
            ...prev,
            [account.id]: {
              totalPosts: s.totalPosts.toLocaleString(),
              totalViews: s.views.total === null ? null : cardNumber(s.views.total),
              engagementRate: s.engagementRate.average === null ? null : formatPercent(s.engagementRate.average, 1),
            },
          }));
        },
        () => {
          // A failed request shows "Not available", never an invented value.
          if (active) setMetrics((prev) => ({ ...prev, [account.id]: { totalPosts: null, totalViews: null, engagementRate: null } }));
        },
      );
    }
    return () => {
      active = false;
    };
    // `key` captures the accounts and their last sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return metrics;
}

function InfoCard({ eyebrow, title, body, icon, iconBg, iconColor, onPress }: { eyebrow: string; title: string; body: string; icon: IconName; iconBg: string; iconColor: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      className="mb-sm flex-row items-center rounded-2xl border border-neutral-100 bg-white px-lg py-md active:bg-neutral-50"
      style={{ shadowColor: colors.navy, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}
    >
      <View className="mr-md h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{eyebrow}</Text>
        <Text className="mt-0.5 text-[15px] font-bold leading-5 text-navy">{title}</Text>
        <Text className="mt-0.5 text-[12px] leading-[17px] text-neutral-500">{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.navy} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

function GridSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading platforms">
      {GRID.map((row) => (
        <View key={row.join()} className="mb-md flex-row" style={{ gap: 12 }}>
          <Skeleton className="h-56 flex-1 rounded-2xl" />
          <Skeleton className="h-56 flex-1 rounded-2xl" />
        </View>
      ))}
    </View>
  );
}

/**
 * Dashboard body: the four platforms as a 2 × 2 grid (connect, manage, or enter that platform's
 * analysis), then two short cards on what Media Navigator does. Detailed analytics live in Analysis.
 */
export function HomeContent({ state, onRetry }: { state: ResourceState<ConnectedAccount[]>; onRetry: () => void }) {
  const router = useRouter();
  const accounts = state.status === 'success' ? state.data : [];
  const metrics = useCardMetrics(accounts);
  const connectedPlatforms = new Set(accounts.map((a) => a.platform)).size;

  // Analysis opens on the chosen account, so the platform context is never lost.
  const openAnalysis = (account: ConnectedAccount) => router.navigate({ pathname: '/intelligence', params: { accountId: account.id } });

  return (
    <View>
      {state.status === 'loading' ? (
        <GridSkeleton />
      ) : state.status === 'error' || state.status === 'unavailable' ? (
        <View className="mb-xl">
          <ErrorState message={state.message} onRetry={onRetry} />
        </View>
      ) : (
        GRID.map((row) => (
          <View key={row.join()} className="mb-sm flex-row" style={{ gap: 10 }}>
            {row.map((platform) => {
              const account = accountFor(accounts, platform);
              return (
                <PlatformDashboardCard
                  key={platform}
                  platform={platform}
                  account={account}
                  metrics={account ? metrics[account.id] : undefined}
                  onConnect={() => router.push(accountHref(platform))}
                  onManage={() => router.push(accountHref(platform))}
                  onViewAnalysis={() => account && openAnalysis(account)}
                />
              );
            })}
          </View>
        ))
      )}

      <View className="mt-sm">
        <InfoCard
          eyebrow="Get started"
          title="Unlock intelligent insights"
          body={
            connectedPlatforms === 0
              ? 'Connect at least one social media account to see your performance, AI analysis and content ideas.'
              : `${connectedPlatforms} of 4 platforms connected. Tap View Analysis to see what works, what to improve and what to post next.`
          }
          icon="bulb-outline"
          iconBg={colors.violetLight}
          iconColor={colors.violet}
          onPress={() => (accounts.length === 0 ? router.push('/connected-accounts') : openAnalysis(accounts[0]))}
        />
        <InfoCard
          eyebrow="Our goal"
          title="Turn your content into growth"
          body="We analyze your content, find what works, and give you data-backed ideas to perform better."
          icon="locate-outline"
          iconBg={colors.successLight}
          iconColor={colors.success}
          onPress={() => router.push('/settings/help')}
        />
      </View>
    </View>
  );
}
