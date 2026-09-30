import { useLocalSearchParams } from 'expo-router';

import { ContentLibrary } from '@/features/intelligence/components/ContentLibrary';
import { TierFilter } from '@/features/intelligence/tiers';
import { ContentFormat, MediaSort } from '@/types/api';

const TIERS: readonly string[] = ['top', 'moderate', 'low'];

export default function ContentLibraryScreen() {
  const params = useLocalSearchParams<{ accountId?: string; sort?: MediaSort; performance?: 'above' | 'below'; format?: ContentFormat; tier?: string }>();
  return (
    <ContentLibrary
      accountId={params.accountId ?? ''}
      initialFormat={params.format ?? null}
      initialSort={params.sort ?? 'recent'}
      initialPerformance={params.performance ?? null}
      initialTier={params.tier && TIERS.includes(params.tier) ? (params.tier as TierFilter) : null}
    />
  );
}
