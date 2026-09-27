import { AiInsightsResult, IntelligenceOverview } from '@/types/api';

// In-memory hand-off between the Intelligence home and its pushed detail screens, so a detail
// screen can render what the home screen already received without another request. It only ever
// holds real API responses, is never persisted, and every screen falls back to fetching when empty.

const overviews = new Map<string, IntelligenceOverview>();
const insights = new Map<string, AiInsightsResult>();

export const intelligenceSession = {
  setOverview(overview: IntelligenceOverview) {
    overviews.set(overview.account.id, overview);
  },
  overview(accountId: string): IntelligenceOverview | null {
    return overviews.get(accountId) ?? null;
  },
  setInsights(accountId: string, result: AiInsightsResult) {
    insights.set(accountId, result);
  },
  insights(accountId: string): AiInsightsResult | null {
    return insights.get(accountId) ?? null;
  },
  clearAccount(accountId: string) {
    overviews.delete(accountId);
    insights.delete(accountId);
  },
};
