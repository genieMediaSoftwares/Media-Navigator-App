import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { ErrorState } from '@/components/ErrorState';
import { ListRow } from '@/components/ListRow';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { Gradient } from '@/components/visual/Gradient';
import { MetricPill, MetricStrip } from '@/components/visual/Metrics';
import { FadeIn, PressableScale } from '@/components/visual/Motion';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { disconnectAccount, fetchAccountDashboard, fetchConnectedAccounts, syncAccount } from '@/features/accounts/api';
import { PlatformOption, platformOption } from '@/features/accounts/platforms';
import { useConnectAccount } from '@/features/accounts/useConnectAccount';
import { fetchIntelligenceOverview } from '@/features/intelligence/api';
import { AccountAvatar } from '@/features/intelligence/components/AccountHeader';
import { MediaRail, tileFromDashboardPost } from '@/features/intelligence/components/MediaTile';
import { SyncState, SyncStatus } from '@/features/intelligence/components/SyncStatus';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { ApiError } from '@/lib/api/client';
import { formatCompactNumber, formatPercent, formatRelativeTime } from '@/lib/format';
import { PlatformConnectView } from '@/features/platforms/components/PlatformConnectView';
import { ConnectedAccount, InstagramDashboardData, SocialPlatform } from '@/types/api';

const FOLLOWER_LABEL: Record<SocialPlatform, string> = { instagram: 'Followers', facebook: 'Followers', youtube: 'Subscribers', linkedin: 'Followers' };
const CONTENT_LABEL: Record<SocialPlatform, string> = { instagram: 'Posts', facebook: 'Posts', youtube: 'Videos', linkedin: 'Posts' };

/**
 * One connected account: profile hero, metrics, content and insights — or, when the platform is not
 * connected yet, its connect flow. Instagram connects with a pasted Meta token; the other platforms
 * use their OAuth sign-in (Facebook also accepts a Meta token).
 */
export function AccountScreen({ platform: platformId }: { platform: SocialPlatform }) {
  const platform = platformOption(platformId);
  const { state: accountsState, reload: reloadAccounts } = useApiResource(fetchConnectedAccounts);

  if (accountsState.status === 'loading') return <ProfileSkeleton platform={platform} />;
  if (accountsState.status === 'error' || accountsState.status === 'unavailable') {
    return (
      <View className="flex-1 bg-white p-xl">
        <ErrorState message={accountsState.message} onRetry={reloadAccounts} />
      </View>
    );
  }
  const account = accountsState.data.find((a) => a.platform === platformId) ?? null;
  if (account) return <ConnectedAccountView account={account} platform={platform} onAccountsChanged={reloadAccounts} />;
  return <PlatformConnectView platform={platformId} onConnected={reloadAccounts} />;
}

// ---------------------------------------------------------------------------------------------
// Connected
// ---------------------------------------------------------------------------------------------

function ConnectedAccountView({
  account,
  platform,
  onAccountsChanged,
}: {
  account: ConnectedAccount;
  platform: PlatformOption;
  onAccountsChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const { connectOAuth } = useConnectAccount();
  const isInstagram = platform.id === 'instagram';
  // Instagram opens Intelligence on its default account exactly as before; other platforms pass their account.
  const openIntelligence = () => router.navigate(isInstagram ? '/intelligence' : { pathname: '/intelligence', params: { accountId: account.id } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: 'idle' });
  const [disconnecting, setDisconnecting] = useState(false);

  const dashboardFetcher = useCallback(() => fetchAccountDashboard(account.id), [account.id]);
  const overviewFetcher = useCallback(() => fetchIntelligenceOverview(account.id), [account.id]);
  const dashboard = useApiResource(dashboardFetcher);
  const intelligence = useApiResource(overviewFetcher);

  const overview = intelligence.state.status === 'success' ? intelligence.state.data.overview : null;
  useEffect(() => {
    if (overview) intelligenceSession.setOverview(overview);
  }, [overview]);

  const refreshAll = useCallback(async () => {
    await Promise.all([dashboard.refresh(), intelligence.refresh()]);
  }, [dashboard, intelligence]);

  const runSync = async () => {
    setSync({ status: 'syncing' });
    try {
      const summary = await syncAccount(account.id);
      intelligenceSession.clearAccount(account.id);
      setSync({ status: 'done', postsSynced: summary.postsSynced });
      await Promise.all([refreshAll(), onAccountsChanged()]);
    } catch (error) {
      setSync({ status: 'error', code: error instanceof ApiError ? error.code : undefined, message: error instanceof Error ? error.message : `${platform.name} sync failed.` });
    }
  };

  const confirmDisconnect = () => {
    setMenuOpen(false);
    Alert.alert(`Disconnect ${platform.name}?`, `@${account.handle} and its synced data will be removed from Media Navigator.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setDisconnecting(true);
          try {
            await disconnectAccount(account.id);
            intelligenceSession.clearAccount(account.id);
            await onAccountsChanged();
          } catch (err) {
            Alert.alert('Unable to disconnect', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setDisconnecting(false);
          }
        },
      },
    ]);
  };

  const dash = dashboard.state.status === 'success' ? dashboard.state.data : null;
  const heroAccount = dash?.account ?? { ...account, profilePictureUrl: account.profilePictureUrl ?? null };
  const needsReconnect = heroAccount.status !== 'connected';

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-3xl"
        refreshControl={<RefreshControl refreshing={dashboard.refreshing} onRefresh={() => void refreshAll()} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Profile hero */}
        <Gradient name="canvas" direction="vertical" style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28 }}>
          <FadeIn className="items-center">
            <AccountAvatar account={heroAccount} size={104} />
            <Text className="mt-lg text-display text-navy" numberOfLines={1}>
              @{heroAccount.handle}
            </Text>
            {heroAccount.displayName ? <Text className="mt-xs text-body text-neutral-500">{heroAccount.displayName}</Text> : null}
            <View className="mt-md flex-row items-center">
              <View className={`flex-row items-center rounded-full px-md py-1 ${needsReconnect ? 'bg-warning-light' : 'bg-success-light'}`}>
                <View className={`mr-xs h-2 w-2 rounded-full ${needsReconnect ? 'bg-warning' : 'bg-success'}`} />
                <Text className={`text-caption font-semibold ${needsReconnect ? 'text-warning' : 'text-success'}`}>{needsReconnect ? 'Reconnect needed' : 'Connected'}</Text>
              </View>
              <Text className="ml-sm text-caption text-neutral-500">Synced {formatRelativeTime(heroAccount.lastSyncedAt).toLowerCase()}</Text>
            </View>

            <View className="mt-xl flex-row items-center self-stretch">
              <PressableScale
                onPress={() => void runSync()}
                disabled={sync.status === 'syncing'}
                accessibilityRole="button"
                accessibilityLabel={`Sync ${platform.name} now`}
                accessibilityState={{ busy: sync.status === 'syncing' }}
                className="flex-1"
              >
                <Gradient name="brand" direction="horizontal" style={{ borderRadius: 999, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={sync.status === 'syncing' ? 'sync' : 'refresh'} size={18} color={colors.white} />
                  <Text className="ml-sm text-body font-semibold text-white">{sync.status === 'syncing' ? 'Syncing…' : 'Sync now'}</Text>
                </Gradient>
              </PressableScale>
              <Pressable
                onPress={openIntelligence}
                accessibilityRole="button"
                accessibilityLabel="Open Intelligence"
                className="ml-sm h-[50px] w-[50px] items-center justify-center rounded-full bg-white active:bg-neutral-100"
              >
                <Ionicons name="sparkles" size={20} color={colors.violet} />
              </Pressable>
              <Pressable
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Account options"
                className="ml-sm h-[50px] w-[50px] items-center justify-center rounded-full bg-white active:bg-neutral-100"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.navy} />
              </Pressable>
            </View>
          </FadeIn>
        </Gradient>

        <View className="px-xl">
          <View className="mt-lg">
            <SyncStatus
              state={sync}
              onRetry={() => void runSync()}
              onReconnect={() => (isInstagram ? setMenuOpen(true) : void connectOAuth(platform.id))}
              onDismiss={() => setSync({ status: 'idle' })}
              platformName={platform.name}
            />
          </View>

          {/* Account snapshot: one stats line, like a social profile */}
          {dashboard.state.status === 'loading' ? (
            <Skeleton className="mb-xl h-12 w-full" />
          ) : dash ? (
            <FadeIn index={1} className="mb-lg">
              <MetricStrip
                metrics={[
                  { label: FOLLOWER_LABEL[platform.id], value: dash.metrics.followersCount === null ? null : formatCompactNumber(dash.metrics.followersCount) },
                  // Only Instagram reports how many accounts the profile follows.
                  ...(isInstagram ? [{ label: 'Following', value: dash.metrics.followsCount === null ? null : formatCompactNumber(dash.metrics.followsCount) }] : []),
                  { label: CONTENT_LABEL[platform.id], value: dash.metrics.mediaCount === null ? null : formatCompactNumber(dash.metrics.mediaCount) },
                  { label: 'Eng. (latest 50)', value: dash.metrics.engagementRate === null ? null : formatPercent(dash.metrics.engagementRate, 2), accent: colors.violet },
                ]}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mt-lg" contentContainerClassName="px-xl">
                <MetricPill icon="radio-outline" label="reach" value={dash.metrics.reach === null ? null : formatCompactNumber(dash.metrics.reach)} />
                <MetricPill icon="layers-outline" label="impressions" value={dash.metrics.impressions === null ? null : formatCompactNumber(dash.metrics.impressions)} />
              </ScrollView>
            </FadeIn>
          ) : (
            <ErrorState title="Account data didn’t load" message={dashboard.state.status === 'error' ? dashboard.state.message : 'Please try again.'} onRetry={dashboard.reload} />
          )}

          <LatestPosts dash={dash} accountId={account.id} />
          <Button title="See what’s working" icon="sparkles-outline" onPress={openIntelligence} />
          <View className="mt-sm">
            <Button title="Content library" icon="grid-outline" variant="secondary" onPress={() => router.push({ pathname: '/intelligence/library', params: { accountId: account.id } })} />
          </View>
        </View>
      </ScrollView>

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={`@${account.handle}`}>
        <View className="-mx-lg">
          <ListRow icon="refresh-outline" label="Sync now" onPress={() => { setMenuOpen(false); void runSync(); }} />
          <ListRow icon="sparkles-outline" label="Open Intelligence" onPress={() => { setMenuOpen(false); openIntelligence(); }} />
          <ListRow icon="grid-outline" label="Content library" onPress={() => { setMenuOpen(false); router.push({ pathname: '/intelligence/library', params: { accountId: account.id } }); }} />
          {isInstagram ? null : <ListRow icon={platform.icon} label={`Reconnect ${platform.name}`} onPress={() => { setMenuOpen(false); void connectOAuth(platform.id); }} />}
        </View>
        <View className="mt-lg">
          <Button title={disconnecting ? 'Disconnecting…' : `Disconnect ${platform.name}`} variant="danger" loading={disconnecting} onPress={confirmDisconnect} />
          {isInstagram ? <Text className="mt-sm text-center text-caption text-neutral-500">To reconnect with a new token, disconnect first and connect again.</Text> : null}
        </View>
      </BottomSheet>
    </View>
  );
}

/** The account's latest synced posts; analysis of them lives in Intelligence. */
function LatestPosts({ dash, accountId }: { dash: InstagramDashboardData | null; accountId: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const posts = dash?.posts ?? [];
  return (
    <FadeIn index={1} className="mb-2xl">
      <SectionTitle title="Latest posts" />
      {posts.length === 0 ? (
        <Text className="text-label font-normal text-neutral-500">No synced posts yet. Tap Sync now to bring in your media.</Text>
      ) : (
        <MediaRail
          items={posts.slice(0, 12).map(tileFromDashboardPost)}
          width={Math.min(width * 0.44, 190)}
          aspect={1.25}
          showDate
          onPress={(item) => router.push({ pathname: '/intelligence/post/[id]', params: { id: item.id, accountId } })}
        />
      )}
    </FadeIn>
  );
}

function ProfileSkeleton({ platform }: { platform: PlatformOption }) {
  return (
    <View className="flex-1 items-center bg-white px-xl pt-lg" accessibilityRole="progressbar" accessibilityLabel={`Loading ${platform.name} account`}>
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="mt-lg h-7 w-48" />
      <Skeleton className="mt-sm h-4 w-32" />
      <Skeleton className="mt-xl h-12 w-80 rounded-full" />
    </View>
  );
}
