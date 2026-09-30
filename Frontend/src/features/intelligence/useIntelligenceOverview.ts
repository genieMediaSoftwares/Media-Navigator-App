import { useCallback } from 'react';

import { useApiResource } from '@/hooks/useApiResource';
import { IntelligenceOverviewResponse } from '@/types/api';

import { fetchIntelligenceOverview } from './api';
import { intelligenceSession } from './session';

/**
 * The account's intelligence overview for a drill-down screen: the copy the Intelligence screen already
 * received when there is one, otherwise a fresh request.
 */
export function useIntelligenceOverview(accountId: string) {
  const fetcher = useCallback(async (): Promise<IntelligenceOverviewResponse> => {
    const cached = accountId ? intelligenceSession.overview(accountId) : null;
    if (cached) return { accounts: [cached.account], overview: cached };
    return fetchIntelligenceOverview(accountId || null);
  }, [accountId]);
  return useApiResource(fetcher);
}
