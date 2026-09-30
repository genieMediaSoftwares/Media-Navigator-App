import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { useApiResource } from '@/hooks/useApiResource';
import { ContentFormat } from '@/types/api';

import { fetchMediaPage } from '../api';
import { FORMAT_LABELS } from '../labels';
import { TIER_COPY, TIER_SORT, TierFilter, typicalBadge } from '../tiers';
import { AiQuietState } from './AiInsightsSection';
import { MediaRow } from './MediaRow';
import { MediaTile, tileFromPost } from './MediaTile';

interface TierListProps {
  accountId: string;
  tier: TierFilter;
  format: ContentFormat | null;
  /** Changes after a sync so the list is refetched. */
  version: string | null;
  limit?: number;
}

/**
 * Real content of one tier, media first. Top content gets large images; moderate and low content
 * use compact rows. Every card leads to the post's own analysis for that tier.
 */
export function TierList({ accountId, tier, format, version, limit = tier === 'top' ? 3 : 5 }: TierListProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const copy = TIER_COPY[tier];
  const fetcher = useCallback(
    () => fetchMediaPage({ accountId, tier, format, sort: TIER_SORT[tier], limit }),
    // version: refetch after a sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, tier, format, limit, version],
  );
  const { state, reload } = useApiResource(fetcher);

  const openPost = (id: string) => router.push({ pathname: '/intelligence/post/[id]', params: { id, accountId, analyze: '1' } });
  const openAll = () => router.push({ pathname: '/intelligence/library', params: { accountId, tier, sort: TIER_SORT[tier], ...(format && { format }) } });

  if (state.status === 'loading') {
    return tier === 'top' ? <Skeleton className="h-80 w-full rounded-3xl" /> : <Skeleton className="h-60 w-full rounded-2xl" />;
  }
  if (state.status !== 'success') {
    return <AiQuietState title="Couldn’t load this content" message={state.message} onRetry={reload} />;
  }

  const { items, total } = state.data;
  if (items.length === 0) {
    const what = format ? FORMAT_LABELS[format].plural.toLowerCase() : 'posts';
    return (
      <Text className="py-lg text-body text-neutral-500">
        No {what} in this group{tier === 'low' ? ' — posts from the last 3 days are still collecting interactions.' : '.'}
      </Text>
    );
  }

  return (
    <View>
      {tier === 'top'
        ? items.map((post) => (
            <View key={post.id} className="mb-lg">
              <MediaTile item={tileFromPost(post)} width={width - 48} aspect={1} onPress={() => openPost(post.id)} cta={copy.cta} badge={typicalBadge(post)} />
            </View>
          ))
        : items.map((post) => <MediaRow key={post.id} post={post} onPress={() => openPost(post.id)} actionLabel={copy.cta} badge={typicalBadge(post)} />)}
      {total > items.length ? (
        <Pressable onPress={openAll} accessibilityRole="button" className="mt-sm min-h-11 justify-center self-start">
          <Text className="text-label font-semibold text-primary">See all {total} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
