import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListRow } from '@/components/ListRow';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { Gradient } from '@/components/visual/Gradient';
import { MetricPill, MetricStrip } from '@/components/visual/Metrics';
import { FadeIn, PressableScale } from '@/components/visual/Motion';
import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { disconnectAccount, fetchAccountDashboard, fetchConnectedAccounts, syncAccount } from '@/features/accounts/api';
import { PlatformOption, platformOption } from '@/features/accounts/platforms';
import { useConnectAccount } from '@/features/accounts/useConnectAccount';
import { fetchAiInsights, fetchIntelligenceOverview } from '@/features/intelligence/api';
import { AccountAvatar } from '@/features/intelligence/components/AccountHeader';
import { AiQuietState } from '@/features/intelligence/components/AiInsightsSection';
import { FormatComparison, FormatMix } from '@/features/intelligence/components/FormatComparison';
import { InsightHero } from '@/features/intelligence/components/InsightHero';
import { MediaRail, MediaTile, tileFromDashboardPost, tileFromPost } from '@/features/intelligence/components/MediaTile';
import { NeedsAttention } from '@/features/intelligence/components/NeedsAttention';
import { SyncState, SyncStatus } from '@/features/intelligence/components/SyncStatus';
import { describeIntelligenceError } from '@/features/intelligence/labels';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { ApiError } from '@/lib/api/client';
import { formatCompactNumber, formatPercent, formatRelativeTime } from '@/lib/format';
import { ConnectedAccount, InstagramDashboardData, IntelligenceOverview, SocialPlatform } from '@/types/api';

type Tab = 'overview' | 'content' | 'insights';

const FOLLOWER_LABEL: Record<SocialPlatform, string> = { instagram: 'Followers', facebook: 'Followers', youtube: 'Subscribers', linkedin: 'Followers' };
const CONTENT_LABEL: Record<SocialPlatform, string> = { instagram: 'Posts', facebook: 'Posts', youtube: 'Videos', linkedin: 'Posts' };
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'content', label: 'Content' },
  { value: 'insights', label: 'Insights' },
] as const;

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
  return platformId === 'instagram' ? <ConnectView onConnected={reloadAccounts} /> : <OAuthConnectView platform={platform} onConnected={reloadAccounts} />;
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
  const [tab, setTab] = useState<Tab>('overview');
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

          <View className="mb-xl">
            <SegmentedControl segments={TABS} value={tab} onChange={setTab} />
          </View>

          {tab === 'overview' ? (
            <OverviewTab dash={dash} overview={overview} overviewLoading={intelligence.state.status === 'loading'} accountId={account.id} />
          ) : tab === 'content' ? (
            <ContentTab dash={dash} accountId={account.id} onSync={() => void runSync()} platformName={platform.name} />
          ) : (
            <InsightsTab overview={overview} loading={intelligence.state.status === 'loading'} accountId={account.id} onOpenIntelligence={openIntelligence} />
          )}
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

function OverviewTab({ dash, overview, overviewLoading, accountId }: { dash: InstagramDashboardData | null; overview: IntelligenceOverview | null; overviewLoading: boolean; accountId: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const posts = dash?.posts ?? [];

  return (
    <View>
      <FadeIn className="mb-2xl">
        <AccountHighlight overview={overview} loading={overviewLoading} accountId={accountId} />
      </FadeIn>

      <FadeIn index={1} className="mb-2xl">
        <SectionTitle eyebrow="Recent content" eyebrowIcon="images-outline" title="Latest posts" action={posts.length ? { label: 'Library', onPress: () => router.push({ pathname: '/intelligence/library', params: { accountId } }) } : undefined} />
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

      {overview && overview.formats.length > 0 ? (
        <FadeIn index={2} className="mb-xl">
          <SectionTitle eyebrow="Format performance" eyebrowIcon="layers-outline" eyebrowColor={colors.magenta} title="How each format performs" />
          <FormatMix counts={overview.archive.formatCounts} />
          <View className="mt-md">
            <FormatComparison formats={overview.formats} onPressFormat={() => router.push({ pathname: '/intelligence/formats', params: { accountId } })} />
          </View>
        </FadeIn>
      ) : null}
    </View>
  );
}

/** The single most useful AI output for the account, or a clear reason there isn't one. */
function AccountHighlight({ overview, loading, accountId }: { overview: IntelligenceOverview | null; loading: boolean; accountId: string }) {
  if (loading) return <Skeleton className="h-48 w-full rounded-3xl" />;
  if (!overview) return <AiQuietState title="Account highlight unavailable" message="Pull to refresh to try again." />;
  if (!overview.aiConfigured) return <AiQuietState title="AI analysis is temporarily unavailable" message="Your account metrics above are unaffected." />;
  if (!overview.ranking.sufficient) {
    return (
      <AiQuietState
        title="More content history needed"
        message={`Account highlights unlock at ${overview.ranking.minimumRequired} posts with engagement data. ${overview.baseline.sampleSize} analyzed so far.`}
        progress={overview.baseline.sampleSize / Math.max(overview.ranking.minimumRequired, 1)}
      />
    );
  }
  return <HighlightLoader accountId={accountId} version={overview.account.lastSyncedAt} />;
}

function HighlightLoader({ accountId, version }: { accountId: string; version: string | null }) {
  const router = useRouter();
  const fetcher = useCallback(() => fetchAiInsights(accountId), [accountId, version]);
  const { state, reload } = useApiResource(fetcher);
  useEffect(() => {
    if (state.status === 'success') intelligenceSession.setInsights(accountId, state.data);
  }, [state, accountId]);

  if (state.status === 'loading') return <Skeleton className="h-48 w-full rounded-3xl" />;
  if (state.status !== 'success') {
    const copy = describeIntelligenceError(state.status === 'error' ? (state.code ?? 'AI_UNAVAILABLE') : 'AI_UNAVAILABLE', state.message);
    return <AiQuietState title={copy.title} message={copy.message} onRetry={reload} />;
  }
  const insight = state.data.insights[0];
  if (!insight) return <AiQuietState title="No highlight yet" message="Try again after your next sync." onRetry={reload} />;
  return (
    <InsightHero
      eyebrow="Account highlight"
      insight={insight}
      onPress={() => router.push({ pathname: '/intelligence/insight/[id]', params: { id: insight.id, accountId } })}
    />
  );
}

function ContentTab({ dash, accountId, onSync, platformName }: { dash: InstagramDashboardData | null; accountId: string; onSync: () => void; platformName: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const posts = dash?.posts ?? [];
  const gap = 3;
  const tile = (width - 48 - gap * 2) / 3;

  if (posts.length === 0) {
    return <EmptyState compact icon="images-outline" title="No synced posts yet" message={`Sync your account to bring in your ${platformName} content and its metrics.`} action={{ label: 'Sync now', onPress: onSync }} />;
  }
  return (
    <View>
      <Text className="mb-md text-caption text-neutral-500">{posts.length} most recent posts</Text>
      <View className="flex-row flex-wrap" style={{ gap }}>
        {posts.map((post) => (
          <MediaTile
            key={post.id}
            item={tileFromDashboardPost(post)}
            width={tile}
            aspect={1.25}
            compact
            onPress={() => router.push({ pathname: '/intelligence/post/[id]', params: { id: post.id, accountId } })}
          />
        ))}
      </View>
      <View className="mt-xl">
        <Button title="Open full content library" icon="grid-outline" variant="secondary" onPress={() => router.push({ pathname: '/intelligence/library', params: { accountId } })} />
      </View>
    </View>
  );
}

function InsightsTab({
  overview,
  loading,
  accountId,
  onOpenIntelligence,
}: {
  overview: IntelligenceOverview | null;
  loading: boolean;
  accountId: string;
  onOpenIntelligence: () => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  if (loading) return <Skeleton className="h-72 w-full rounded-3xl" />;
  if (!overview) return <AiQuietState title="Insights unavailable" message="Pull to refresh to try again." />;
  const openPost = (id: string) => router.push({ pathname: '/intelligence/post/[id]', params: { id, accountId, analyze: '1' } });

  return (
    <View>
      <FadeIn className="mb-2xl">
        <SectionTitle eyebrow="What’s working" eyebrowIcon="trending-up" eyebrowColor={colors.success} title="Your top content" />
        {!overview.ranking.sufficient ? (
          <Text className="text-label font-normal text-neutral-500">
            More content history needed — rankings appear at {overview.ranking.minimumRequired} posts with engagement data.
          </Text>
        ) : overview.ranking.working.length === 0 ? (
          <Text className="text-label font-normal text-neutral-500">No post is above your account average yet.</Text>
        ) : (
          <MediaRail items={overview.ranking.working.map(tileFromPost)} width={Math.min(width * 0.62, 280)} aspect={1.25} showDelta cta="Why it worked" onPress={(item) => openPost(item.id)} />
        )}
      </FadeIn>
      <NeedsAttention
        posts={overview.ranking.attention}
        baseline={overview.baseline.avgInteractions}
        median={overview.baseline.medianInteractions}
        sufficient={overview.ranking.sufficient}
        onOpen={(post) => openPost(post.id)}
        onSeeAll={() => router.push({ pathname: '/intelligence/library', params: { accountId, performance: 'below' } })}
      />
      <Button title="Open full Intelligence" icon="sparkles-outline" onPress={onOpenIntelligence} />
    </View>
  );
}

function ProfileSkeleton({ platform }: { platform: PlatformOption }) {
  return (
    <View className="flex-1 items-center bg-white px-xl pt-lg" accessibilityRole="progressbar" accessibilityLabel={`Loading ${platform.name} account`}>
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="mt-lg h-7 w-48" />
      <Skeleton className="mt-sm h-4 w-32" />
      <Skeleton className="mt-xl h-12 w-80 rounded-full" />
      <Skeleton className="mt-xl h-12 w-80" />
      <Skeleton className="mt-xl h-48 w-80 rounded-3xl" />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Not connected: token connection (Option A)
// ---------------------------------------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <View className="mb-xl flex-row">
      <Gradient name="ai" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
        <Text className="text-label font-bold text-white">{n}</Text>
      </Gradient>
      <View className="ml-md flex-1">
        <Text className="mb-sm text-title text-navy">{title}</Text>
        {children}
      </View>
    </View>
  );
}

function ConnectView({ onConnected }: { onConnected: () => Promise<void> }) {
  const { connectToken, connecting } = useConnectAccount();
  const [token, setToken] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const isConnecting = Boolean(connecting);

  const openExplorer = async () => {
    try {
      await Linking.openURL('https://developers.facebook.com/tools/explorer/');
    } catch {
      Alert.alert('Unable to open browser', 'Please open https://developers.facebook.com/tools/explorer/ in your browser.');
    }
  };

  const submit = async () => {
    const clean = token.trim();
    if (!clean) {
      setFieldError('Paste your Meta Graph API access token.');
      return;
    }
    setFieldError(null);
    const result = await connectToken('instagram', clean);
    if (result) {
      setToken('');
      await onConnected();
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView className="flex-1" contentContainerClassName="pb-3xl" keyboardShouldPersistTaps="handled">
        <Gradient name="brand" style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
          <FadeIn>
            <View className="h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.onDarkSubtle }}>
              <Ionicons name="logo-instagram" size={34} color={colors.white} />
            </View>
            <Text className="mt-xl text-display text-white">Bring your Instagram into Media Navigator</Text>
            <Text className="mt-sm text-body" style={{ color: colors.onDarkMuted }}>
              See what’s working, what needs attention, and ask AI about your real content.
            </Text>
            <View className="mt-lg flex-row flex-wrap">
              {['Top content', 'Format patterns', 'AI insights'].map((item) => (
                <View key={item} className="mb-sm mr-sm rounded-full px-md py-1" style={{ backgroundColor: colors.onDarkSubtle }}>
                  <Text className="text-caption font-semibold text-white">{item}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
        </Gradient>

        <View className="px-xl pt-2xl">
          <Overline className="mb-lg">Connect in two steps</Overline>
          <Step n={1} title="Get an access token from Meta">
            <Text className="mb-md text-label font-normal text-neutral-500">Use Meta Graph API Explorer with instagram_basic and instagram_manage_insights permissions.</Text>
            <Button title="Open Meta Graph API Explorer" icon="open-outline" variant="secondary" size="sm" onPress={() => void openExplorer()} accessibilityHint="Opens Meta Graph API Explorer in your browser" />
          </Step>
          <Step n={2} title="Paste it here">
            <TextField
              label="Meta Graph API token"
              placeholder="Paste your access token"
              value={token}
              onChangeText={(text) => {
                setToken(text);
                if (fieldError) setFieldError(null);
              }}
              secureToggle
              error={fieldError}
              editable={!isConnecting}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Step>

          <Button title={isConnecting ? 'Connecting…' : 'Connect Instagram'} onPress={() => void submit()} disabled={isConnecting || !token.trim()} loading={isConnecting} />

          <View className="mt-xl flex-row items-start rounded-2xl bg-neutral-50 p-lg">
            <Ionicons name="lock-closed" size={16} color={colors.success} />
            <Text className="ml-sm flex-1 text-caption text-neutral-500">
              Your token goes only to the Media Navigator server, where it is validated with Meta and stored encrypted. It never stays on this device.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------------------------
// Not connected: OAuth sign-in (Facebook, YouTube, LinkedIn)
// ---------------------------------------------------------------------------------------------

const OAUTH_COPY: Record<Exclude<SocialPlatform, 'instagram'>, { what: string; requirement: string; access: string }> = {
  facebook: {
    what: 'Facebook Page',
    requirement: 'You need a role on the Facebook Page you want to connect.',
    access: 'Media Navigator asks Meta for read-only access to your Pages’ posts and insights.',
  },
  youtube: {
    what: 'YouTube channel',
    requirement: 'Sign in with the Google account that owns or manages the channel.',
    access: 'Media Navigator asks Google for read-only access to your channel, videos and YouTube Analytics.',
  },
  linkedin: {
    what: 'LinkedIn page',
    requirement: 'You need to be an administrator of the LinkedIn company page.',
    access: 'Media Navigator asks LinkedIn for read-only access to your organization’s posts and statistics.',
  },
};

function OAuthConnectView({ platform, onConnected }: { platform: PlatformOption; onConnected: () => Promise<void> }) {
  const { connectOAuth, connectToken, connecting } = useConnectAccount();
  const [token, setToken] = useState('');
  const copy = OAUTH_COPY[platform.id as Exclude<SocialPlatform, 'instagram'>];
  const isConnecting = Boolean(connecting);

  const submitToken = async () => {
    const result = await connectToken(platform.id, token.trim());
    if (result) {
      setToken('');
      await onConnected();
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView className="flex-1" contentContainerClassName="pb-3xl" keyboardShouldPersistTaps="handled">
        <Gradient name="brand" style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
          <FadeIn>
            <View className="h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.onDarkSubtle }}>
              <Ionicons name={platform.icon} size={34} color={colors.white} />
            </View>
            <Text className="mt-xl text-display text-white">Bring your {copy.what} into Media Navigator</Text>
            <Text className="mt-sm text-body" style={{ color: colors.onDarkMuted }}>
              See what’s working, what needs attention, and ask AI about your real content.
            </Text>
          </FadeIn>
        </Gradient>

        <View className="px-xl pt-2xl">
          <Overline className="mb-lg">Connect</Overline>
          <Step n={1} title={`Sign in with ${platform.name}`}>
            <Text className="mb-md text-label font-normal text-neutral-500">{copy.requirement}</Text>
            <Button
              title={connecting === platform.id ? 'Opening…' : `Continue with ${platform.name}`}
              icon={platform.icon}
              onPress={() => void connectOAuth(platform.id)}
              loading={connecting === platform.id}
              disabled={isConnecting}
              accessibilityHint={`Opens ${platform.name} sign-in in a secure browser window`}
            />
          </Step>
          <Step n={2} title="Choose what to connect">
            <Text className="text-label font-normal text-neutral-500">
              If you manage more than one {copy.what}, you’ll pick one after signing in. Your first sync starts right away.
            </Text>
          </Step>

          {platform.id === 'facebook' ? (
            <View className="mb-xl rounded-2xl border border-neutral-200 p-lg">
              <Text className="mb-sm text-title text-navy">Or use a Meta access token</Text>
              <Text className="mb-md text-label font-normal text-neutral-500">
                A user token from Meta Graph API Explorer with pages_show_list and pages_read_engagement works too.
              </Text>
              <TextField
                label="Meta Graph API token"
                placeholder="Paste your access token"
                value={token}
                onChangeText={setToken}
                secureToggle
                editable={!isConnecting}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button title="Connect with token" variant="secondary" onPress={() => void submitToken()} disabled={isConnecting || !token.trim()} loading={connecting === 'facebook' && token !== ''} />
            </View>
          ) : null}

          <View className="flex-row items-start rounded-2xl bg-neutral-50 p-lg">
            <Ionicons name="lock-closed" size={16} color={colors.success} />
            <Text className="ml-sm flex-1 text-caption text-neutral-500">
              {copy.access} Access tokens are stored encrypted on the Media Navigator server and never on this device.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
