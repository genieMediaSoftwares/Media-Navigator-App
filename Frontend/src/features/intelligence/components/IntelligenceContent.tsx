import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Divider } from '@/components/ui/Divider';
import { SegmentedControl } from '@/components/visual/SegmentedControl';
import { accountHref, platformOption } from '@/features/accounts/platforms';
import { PerformersSection } from '@/features/analysis/components/PerformersSection';
import { SyncBar } from '@/features/analysis/components/SyncBar';
import { TrendsSection } from '@/features/analysis/components/TrendsSection';
import { IntelligenceAccount, IntelligenceOverview } from '@/types/api';

import { intelligenceSession } from '../session';
import { AccountHeader } from './AccountHeader';

export type AnalysisSection = 'top' | 'improve' | 'trends';

const SECTIONS: Array<{ value: AnalysisSection; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'improve', label: 'Improve' },
  { value: 'trends', label: 'AI Trends' },
];

interface IntelligenceContentProps {
  overview: IntelligenceOverview;
  accounts: IntelligenceAccount[];
  section: AnalysisSection;
  onSectionChange: (section: AnalysisSection) => void;
  onSelectAccount: (accountId: string) => void;
  /** Reload the overview after a sync. */
  onSynced: () => void;
}

/**
 * Instagram Analysis: three views of one workflow — Top Performers (what works and why), Needs
 * Improvement (what didn't and how to fix it) and AI Trends (patterns and priorities). Deeper tools
 * (formats, library, Ask) keep their own screens.
 */
export function IntelligenceContent({ overview, accounts, section, onSectionChange, onSelectAccount, onSynced }: IntelligenceContentProps) {
  const router = useRouter();
  const accountId = overview.account.id;
  const platform = platformOption(overview.account.platform);
  const { archive } = overview;
  const version = overview.account.lastSyncedAt;

  useEffect(() => {
    intelligenceSession.setOverview(overview);
  }, [overview]);

  const open = (pathname: '/intelligence/formats' | '/intelligence/trends' | '/intelligence/library') => router.push({ pathname, params: { accountId } });

  return (
    <View>
      <AccountHeader account={overview.account} accounts={accounts} syncedPosts={archive.syncedCount} onSelect={onSelectAccount} hideSyncTime />

      {overview.account.status !== 'connected' ? (
        <View className="mb-xl flex-row items-center rounded-2xl bg-warning-light p-lg" accessibilityRole="alert">
          <View className="flex-1">
            <Text className="text-label font-semibold text-navy">{platform.name} needs to be reconnected</Text>
            <Text className="mt-xs text-caption text-neutral-500">You’re seeing your last synced data.</Text>
          </View>
          <Pressable onPress={() => router.push(accountHref(overview.account.platform))} accessibilityRole="button" className="min-h-11 justify-center rounded-full bg-white px-lg">
            <Text className="text-label font-bold text-warning">Reconnect</Text>
          </Pressable>
        </View>
      ) : null}

      <SyncBar accountId={accountId} platformName={platform.name} sync={overview.sync} onSynced={onSynced} onReconnect={() => router.push(accountHref(platform.id))} />

      {archive.syncedCount === 0 ? (
        <EmptyState icon="cloud-download-outline" title={`No ${platform.name} content has been synchronized yet`} message={`Use Sync above to bring in your posts and their real metrics from ${platform.name}.`} />
      ) : (
        <>
          <View className="mb-xl">
            <SegmentedControl segments={SECTIONS} value={section} onChange={onSectionChange} />
          </View>

          <View className="mb-2xl">
            {section === 'trends' ? (
              <TrendsSection accountId={accountId} version={version} />
            ) : (
              <PerformersSection key={section} accountId={accountId} platform={overview.account.platform} type={section} formats={archive.formatCounts.map((f) => f.format)} version={version} />
            )}
          </View>

          <View className="mb-xl">
            <Text className="mb-sm px-xs text-caption font-semibold uppercase tracking-wide text-neutral-500">Go deeper</Text>
            <View className="overflow-hidden rounded-2xl bg-neutral-50">
              <ListRow icon="layers-outline" label="Average performance by format" onPress={() => open('/intelligence/formats')} />
              <Divider inset />
              <ListRow icon="bulb-outline" label="AI executive insights" onPress={() => open('/intelligence/trends')} />
              <Divider inset />
              <ListRow icon="chatbubble-ellipses-outline" label="Ask Media Navigator" onPress={() => router.push({ pathname: '/intelligence/ask', params: { accountId } })} />
              <Divider inset />
              <ListRow icon="grid-outline" label={`All ${archive.syncedCount.toLocaleString()} posts`} onPress={() => open('/intelligence/library')} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}
