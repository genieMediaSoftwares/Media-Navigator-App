import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { MetricStrip } from '@/components/visual/Metrics';
import { FadeIn } from '@/components/visual/Motion';
import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { accountHref, platformOption } from '@/features/accounts/platforms';
import { formatCompactNumber } from '@/lib/format';
import { ContentFormat, IntelligenceAccount, IntelligenceOverview } from '@/types/api';

import { FORMAT_LABELS } from '../labels';
import { intelligenceSession } from '../session';
import { TIER_COPY, TierFilter } from '../tiers';
import { AccountHeader } from './AccountHeader';
import { AiQuietState } from './AiInsightsSection';
import { TierList } from './TierList';

interface IntelligenceContentProps {
  overview: IntelligenceOverview;
  accounts: IntelligenceAccount[];
  onSelectAccount: (accountId: string) => void;
  onSync: () => void;
  syncing: boolean;
  onExplain: () => void;
}

const TIER_ORDER: TierFilter[] = ['top', 'moderate', 'low'];

/**
 * Intelligence answers one question: what is working and what is not. A short summary, then the
 * account's real content split into Top / Moderate / Low (relative to its typical post). Formats,
 * trends, the library and Ask each have their own screen.
 */
export function IntelligenceContent({ overview, accounts, onSelectAccount, onSync, syncing, onExplain }: IntelligenceContentProps) {
  const router = useRouter();
  const accountId = overview.account.id;
  const platformName = platformOption(overview.account.platform).name;
  const [tier, setTier] = useState<TierFilter>('top');
  const [format, setFormat] = useState<ContentFormat | null>(null);
  const { tiers, archive } = overview;

  useEffect(() => {
    intelligenceSession.setOverview(overview);
  }, [overview]);

  const open = (pathname: '/intelligence/formats' | '/intelligence/trends' | '/intelligence/library') => router.push({ pathname, params: { accountId } });

  return (
    <View>
      <AccountHeader account={overview.account} accounts={accounts} syncedPosts={archive.syncedCount} onSelect={onSelectAccount} />

      {overview.account.status !== 'connected' ? (
        <View className="mb-xl flex-row items-center rounded-2xl bg-warning-light p-lg" accessibilityRole="alert">
          <View className="flex-1">
            <Text className="text-label font-semibold text-navy">{platformName} needs to be reconnected</Text>
            <Text className="mt-xs text-caption text-neutral-500">You’re seeing your last synced data.</Text>
          </View>
          <Pressable onPress={() => router.push(accountHref(overview.account.platform))} accessibilityRole="button" className="min-h-11 justify-center rounded-full bg-white px-lg">
            <Text className="text-label font-bold text-warning">Reconnect</Text>
          </Pressable>
        </View>
      ) : null}

      {archive.syncedCount === 0 ? (
        <EmptyState
          icon="cloud-download-outline"
          title={`No ${platformName} content has been synchronized yet`}
          message={`Sync your account to bring in your posts and their real metrics from ${platformName}.`}
          action={syncing ? undefined : { label: 'Sync now', onPress: onSync }}
        />
      ) : (
        <>
          {/* Summary: what was analyzed */}
          <FadeIn className="mb-2xl">
            <Text className="text-display text-navy" accessibilityRole="header">
              {archive.syncedCount.toLocaleString()} posts analyzed
            </Text>
            <View className="mt-lg">
              <MetricStrip
                metrics={[
                  { label: archive.viewsAvailableCount < archive.syncedCount ? `Views (${archive.viewsAvailableCount} posts)` : 'Views', value: archive.totalViews === null ? null : formatCompactNumber(archive.totalViews) },
                  { label: 'Interactions', value: archive.totalInteractions === null ? null : formatCompactNumber(archive.totalInteractions) },
                  { label: 'Typical post', value: tiers.typicalInteractions === null ? null : formatCompactNumber(tiers.typicalInteractions) },
                ]}
              />
            </View>
            <Pressable onPress={onExplain} accessibilityRole="button" className="mt-sm min-h-11 justify-center self-center">
              <Text className="text-caption text-neutral-500">
                Typical post = the middle of your posts by interactions. <Text className="font-semibold text-primary">How it’s measured</Text>
              </Text>
            </Pressable>
          </FadeIn>

          {/* Top / Moderate / Low */}
          <FadeIn index={1} className="mb-2xl">
            {!tiers.sufficient ? (
              <AiQuietState
                title="More content history needed"
                message={`Top, moderate and low content appear once ${tiers.minimumRequired} posts have engagement data. ${overview.baseline.sampleSize} so far.`}
                progress={overview.baseline.sampleSize / Math.max(tiers.minimumRequired, 1)}
              />
            ) : (
              <>
                <SegmentedControl segments={TIER_ORDER.map((value) => ({ value, label: TIER_COPY[value].label }))} value={tier} onChange={setTier} />
                <Text className="mb-md mt-lg text-heading text-navy" accessibilityRole="header">
                  {TIER_COPY[tier].title}
                </Text>
                <Text className="-mt-sm mb-md text-label font-normal text-neutral-500">
                  {tiers.counts[tier].toLocaleString()} {tiers.counts[tier] === 1 ? 'post' : 'posts'} · {TIER_COPY[tier].subtitle}
                  {tiers.typicalInteractions !== null ? ` Your typical post gets ${formatCompactNumber(tiers.typicalInteractions)} interactions.` : ''}
                </Text>
                {archive.formatCounts.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-lg" contentContainerClassName="px-xl">
                    {[null, ...archive.formatCounts.map((f) => f.format)].map((option) => {
                      const selected = option === format;
                      return (
                        <Pressable
                          key={option ?? 'all'}
                          onPress={() => setFormat(option)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={`mr-sm min-h-10 flex-row items-center justify-center rounded-full px-lg ${selected ? 'bg-navy' : 'bg-neutral-100'}`}
                        >
                          {option ? <View className="mr-xs h-2 w-2 rounded-full" style={{ backgroundColor: FORMAT_LABELS[option].color }} /> : null}
                          <Text className={`text-label ${selected ? 'font-semibold text-white' : 'text-navy'}`}>{option ? FORMAT_LABELS[option].plural : 'All'}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                <TierList accountId={accountId} tier={tier} format={format} version={overview.account.lastSyncedAt} />
              </>
            )}
          </FadeIn>

          {/* Deeper questions, each with one home */}
          <FadeIn index={2} className="mb-2xl">
            <Text className="mb-sm px-xs text-caption font-semibold uppercase tracking-wide text-neutral-500">Go deeper</Text>
            <View className="overflow-hidden rounded-2xl bg-neutral-50">
              <ListRow icon="layers-outline" label="Which formats work best" onPress={() => open('/intelligence/formats')} />
              <Divider inset />
              <ListRow icon="trending-up-outline" label="Patterns in your content" onPress={() => open('/intelligence/trends')} />
              <Divider inset />
              <ListRow icon="chatbubble-ellipses-outline" label="Ask Media Navigator" onPress={() => router.push({ pathname: '/intelligence/ask', params: { accountId } })} />
              <Divider inset />
              <ListRow icon="grid-outline" label={`All ${archive.syncedCount.toLocaleString()} posts`} onPress={() => open('/intelligence/library')} />
            </View>
          </FadeIn>

          {overview.lastSyncRun?.status === 'failed' ? (
            <Text className="mb-sm text-center text-caption text-danger">Last sync failed: {overview.lastSyncRun.errorMessage ?? 'Unknown error'}</Text>
          ) : null}
          <Button title={syncing ? 'Syncing…' : 'Sync now'} icon="refresh-outline" variant="ghost" size="sm" loading={syncing} onPress={onSync} />
        </>
      )}
    </View>
  );
}
