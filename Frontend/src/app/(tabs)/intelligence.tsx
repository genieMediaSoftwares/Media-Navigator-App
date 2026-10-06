import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ComponentProps, ReactNode, useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MediaNavigatorLogo } from '@/components/brand/MediaNavigatorLogo';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { syncAccount } from '@/features/accounts/api';
import { accountHref, platformOption } from '@/features/accounts/platforms';
import { fetchAnalysis } from '@/features/analysis/api';
import { ContentSection } from '@/features/analysis/screen/ContentSection';
import { SelectButton } from '@/features/analysis/screen/Pieces';
import { DistributionCard, OverallPerformanceCard, PERIOD_LABEL, TopPerformerCard } from '@/features/analysis/screen/SummaryCards';
import { TrendsCard } from '@/features/analysis/screen/TrendsCard';
import { PlatformLogoTile } from '@/features/home/components/PlatformDashboardCard';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { ApiError } from '@/lib/api/client';
import { Analysis, AnalysisAccount, AnalysisPeriod } from '@/types/analysis';

const PERIODS: { value: AnalysisPeriod; label: string }[] = [
  { value: '7d', label: PERIOD_LABEL['7d'] },
  { value: '30d', label: PERIOD_LABEL['30d'] },
  { value: '90d', label: PERIOD_LABEL['90d'] },
];

function countLabel(account: AnalysisAccount): string {
  const noun = account.platform === 'youtube' ? 'video' : 'post';
  return `${account.contentCount.toLocaleString()} ${noun}${account.contentCount === 1 ? '' : 's'}`;
}

/** All Platforms (2+ connected accounts) and one entry per connected account, with real counts. */
function PlatformSelector({ analysis, onSelect }: { analysis: Analysis; onSelect: (scope: string) => void }) {
  const multi = analysis.accounts.length > 1;
  const samePlatform = (a: AnalysisAccount) => analysis.accounts.filter((x) => x.platform === a.platform).length > 1;
  const item = (key: string, title: string, subtitle: string, icon: ReactNode) => {
    const active = analysis.scope === key;
    return (
      <Pressable
        key={key}
        onPress={() => onSelect(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${title}, ${subtitle}`}
        className={`mr-xs flex-row items-center rounded-2xl px-md py-sm ${active ? 'border border-primary/20 bg-sky' : ''}`}
      >
        {icon}
        <View className="ml-sm">
          <Text className={`text-[13px] font-semibold ${active ? 'text-primary' : 'text-navy'}`} numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-[11px] text-neutral-500" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-md mb-md" contentContainerClassName="px-md" accessibilityRole="tablist">
      {multi
        ? item(
            'all',
            'All Platforms',
            'Combined view',
            <View className="h-7 w-7 flex-row flex-wrap" style={{ gap: 2 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} className="h-[12.5px] w-[12.5px] rounded-[3px] bg-primary-bright" />
              ))}
            </View>,
          )
        : null}
      {analysis.accounts.map((a) =>
        item(a.id, samePlatform(a) ? `${platformOption(a.platform).name} · @${a.handle}` : platformOption(a.platform).name, countLabel(a), <PlatformLogoTile platform={a.platform} size={28} />),
      )}
    </ScrollView>
  );
}

function AnalysisSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading analysis">
      <View className="mb-md flex-row">
        {[0, 1, 2].map((i) => (
          <View key={i} className="mr-sm h-12 w-28">
            <Skeleton className="h-full w-full rounded-2xl" />
          </View>
        ))}
      </View>
      <Skeleton className="mb-md h-36 w-full rounded-2xl" />
      <Skeleton className="mb-md h-56 w-full rounded-2xl" />
      <View className="mb-md flex-row">
        <View className="mr-sm h-36 flex-1">
          <Skeleton className="h-full w-full rounded-2xl" />
        </View>
        <View className="h-36 flex-1">
          <Skeleton className="h-full w-full rounded-2xl" />
        </View>
      </View>
      <Skeleton className="h-52 w-full rounded-2xl" />
    </View>
  );
}

function Centered({ icon, title, message, action }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; message: string; action?: ReactNode }) {
  return (
    <View className="items-center rounded-2xl bg-neutral-50 px-xl py-2xl">
      <Ionicons name={icon} size={30} color={colors.primary} />
      <Text className="mt-md text-center text-title text-navy">{title}</Text>
      <Text className="mb-lg mt-xs text-center text-label font-normal text-neutral-500">{message}</Text>
      {action}
    </View>
  );
}

/**
 * Analysis: All Platforms (cross-platform, 2+ accounts) or one connected account. Every section follows
 * the selected scope and date range; all numbers come from GET /api/intelligence/analysis.
 */
export default function AnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountId?: string }>();
  const [scope, setScope] = useState<string | null>(params.accountId || null);
  const [period, setPeriod] = useState<AnalysisPeriod>('30d');
  // A "View Analysis" tap on the Dashboard opens this tab on that account.
  const [seenParam, setSeenParam] = useState(params.accountId);
  if (seenParam !== params.accountId) {
    setSeenParam(params.accountId);
    if (params.accountId) setScope(params.accountId);
  }

  const fetcher = useCallback(() => fetchAnalysis(scope, period), [scope, period]);
  const { state, refreshing, reload, refresh } = useApiResource(fetcher);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const analysis = state.status === 'success' ? state.data.analysis : null;
  const single = analysis && analysis.scope !== 'all' ? (analysis.accounts.find((a) => a.id === analysis.scope) ?? null) : null;
  const scopeLabel = single ? platformOption(single.platform).name : 'All Platforms';

  const runSync = async (accountId: string) => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncAccount(accountId);
      intelligenceSession.clearAccount(accountId);
      await refresh();
    } catch (error) {
      setSyncError(error instanceof ApiError || error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        contentContainerClassName="px-md pb-3xl pt-sm"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View className="mb-md flex-row items-center justify-between px-xs">
          <MediaNavigatorLogo height={38} />
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <SelectButton value={period} options={PERIODS} onChange={setPeriod} title="Date range" accessibilityLabel="Date range" />
            <Pressable
              onPress={() => router.push('/notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={4}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-neutral-100"
            >
              <Ionicons name="notifications-outline" size={23} color={colors.navy} />
            </Pressable>
          </View>
        </View>

        <View className="mb-md px-xs">
          <Text className="text-[30px] font-extrabold leading-[36px] text-navy" accessibilityRole="header">
            Analysis
          </Text>
          <Text className="mt-xs text-[14px] leading-[20px] text-neutral-500">Explore performance, trends and AI-powered insights for your connected accounts.</Text>
        </View>

        {state.status === 'loading' ? (
          <AnalysisSkeleton />
        ) : state.status !== 'success' ? (
          <Centered icon="cloud-offline-outline" title="Unable to load analysis" message="Check your connection and try again." action={<Button title="Try Again" onPress={reload} />} />
        ) : !analysis ? (
          <Centered
            icon="link-outline"
            title="Connect an account to start"
            message="Analysis becomes available once a platform is connected and its content has synced."
            action={<Button title="Connect an account" onPress={() => router.navigate('/')} />}
          />
        ) : (
          <>
            <PlatformSelector analysis={analysis} onSelect={setScope} />

            {single && single.status !== 'connected' ? (
              <View className="mb-md flex-row items-center rounded-2xl bg-warning-light p-md" accessibilityRole="alert">
                <Text className="flex-1 text-caption text-navy">{platformOption(single.platform).name} needs to be reconnected. You’re seeing your last synced data.</Text>
                <Pressable onPress={() => router.push(accountHref(single.platform))} accessibilityRole="button" className="ml-sm min-h-10 justify-center rounded-full bg-white px-md">
                  <Text className="text-caption font-bold text-warning">Reconnect</Text>
                </Pressable>
              </View>
            ) : null}

            {single && single.contentCount === 0 ? (
              <Centered
                icon="cloud-download-outline"
                title="Your analysis is being prepared"
                message={syncError ?? 'Sync your content to unlock performance insights.'}
                action={<Button title={syncing ? 'Syncing…' : 'Sync Now'} icon="refresh-outline" loading={syncing} onPress={() => void runSync(single.id)} />}
              />
            ) : (
              <>
                <OverallPerformanceCard analysis={analysis} scopeLabel={scopeLabel} />
                <TrendsCard key={`${analysis.scope}:${period}`} analysis={analysis} />
                <View className="flex-row">
                  <DistributionCard analysis={analysis} />
                  <TopPerformerCard analysis={analysis} />
                </View>
                <ContentSection key={analysis.scope} analysis={analysis} period={period} />

                {single ? (
                  <View className="mt-xs flex-row flex-wrap justify-center" style={{ gap: 8 }}>
                    {(
                      [
                        ['Ask Media Navigator', 'chatbubble-ellipses-outline', '/intelligence/ask'],
                        ['Formats', 'layers-outline', '/intelligence/formats'],
                        ['AI insights', 'bulb-outline', '/intelligence/trends'],
                      ] as const
                    ).map(([label, icon, pathname]) => (
                      <Pressable
                        key={pathname}
                        onPress={() => router.push({ pathname, params: { accountId: single.id } })}
                        accessibilityRole="button"
                        className="min-h-10 flex-row items-center rounded-full bg-neutral-50 px-md active:bg-neutral-100"
                      >
                        <Ionicons name={icon} size={15} color={colors.primary} />
                        <Text className="ml-xs text-[12px] font-semibold text-primary">{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
