import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { fetchIntelligenceOverview } from '@/features/intelligence/api';
import { ContentLibrary } from '@/features/intelligence/components/ContentLibrary';
import { EvidenceTag } from '@/features/intelligence/components/Evidence';
import { FormatMix } from '@/features/intelligence/components/FormatComparison';
import { intelligenceSession } from '@/features/intelligence/session';
import { useApiResource } from '@/hooks/useApiResource';
import { IntelligenceOverview } from '@/types/api';

/**
 * Format Patterns → Details: the publishing mix, then the account's actual content (filterable by
 * format) — a drill-down into the posts behind the format averages shown on Intelligence.
 */
function FormatsContent({ overview }: { overview: IntelligenceOverview }) {
  return (
    <ContentLibrary
      accountId={overview.account.id}
      initialSort="interactions"
      summary={
        <FadeIn className="mb-xl pt-md">
          <View className="mb-sm flex-row items-center justify-between">
            <Overline icon="layers-outline" color={colors.magenta}>
              Publishing mix
            </Overline>
            <EvidenceTag kind="observed" />
          </View>
          <FormatMix counts={overview.archive.formatCounts} />
        </FadeIn>
      }
    />
  );
}

export default function FormatPerformanceScreen() {
  const { accountId = '' } = useLocalSearchParams<{ accountId?: string }>();
  const cached = intelligenceSession.overview(accountId);
  if (cached) return <FormatsContent overview={cached} />;
  return <FormatsLoader accountId={accountId} />;
}

function FormatsLoader({ accountId }: { accountId: string }) {
  const fetcher = useCallback(() => fetchIntelligenceOverview(accountId || null), [accountId]);
  const { state, reload } = useApiResource(fetcher);
  if (state.status === 'loading') return <LoadingState message="Loading format performance…" />;
  if (state.status === 'success' && state.data.overview) return <FormatsContent overview={state.data.overview} />;
  return (
    <View className="flex-1 bg-white p-xl">
      <ErrorState message={state.status === 'success' ? 'Connect Instagram to see format performance.' : state.message} onRetry={reload} />
    </View>
  );
}
