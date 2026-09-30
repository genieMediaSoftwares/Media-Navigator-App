import { useLocalSearchParams } from 'expo-router';

import { ContentLibrary } from '@/features/intelligence/components/ContentLibrary';
import { ContentFormat, MediaSort } from '@/types/api';

export default function ContentLibraryScreen() {
  const params = useLocalSearchParams<{ accountId?: string; sort?: MediaSort; performance?: 'above' | 'below'; format?: ContentFormat }>();
  return (
    <ContentLibrary accountId={params.accountId ?? ''} initialFormat={params.format ?? null} initialSort={params.sort ?? 'recent'} initialPerformance={params.performance ?? null} />
  );
}
