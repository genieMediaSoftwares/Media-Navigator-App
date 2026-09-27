import { apiRequest } from '@/lib/api/client';
import { deviceTimeZone } from '@/lib/timezone';
import {
  AiInsightsResult,
  AiPostAnalysis,
  AskAnswer,
  AskHistory,
  IntelligenceOverviewResponse,
  MediaPage,
  MediaQuery,
  PostDetail,
} from '@/types/api';

// Intelligence data comes only from the Worker. AI text is generated server-side (Worker → Gemini);
// the app never calls Gemini and never holds a Meta token.

function query(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function fetchIntelligenceOverview(accountId: string | null): Promise<IntelligenceOverviewResponse> {
  return apiRequest(`/api/intelligence/overview${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchAiInsights(accountId: string): Promise<AiInsightsResult> {
  return apiRequest(`/api/intelligence/insights${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchMediaPage(params: MediaQuery): Promise<MediaPage> {
  return apiRequest(`/api/intelligence/media${query({ ...params })}`, { auth: true });
}

export function fetchPostDetail(accountId: string | null, id: string): Promise<PostDetail> {
  return apiRequest(`/api/intelligence/media/${encodeURIComponent(id)}${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchPostAnalysis(accountId: string | null, id: string): Promise<AiPostAnalysis> {
  return apiRequest(`/api/intelligence/media/${encodeURIComponent(id)}/analysis${query({ accountId, tz: deviceTimeZone() })}`, {
    auth: true,
  });
}

export function fetchAskHistory(accountId: string | null): Promise<AskHistory> {
  return apiRequest(`/api/intelligence/ask${query({ accountId })}`, { auth: true });
}

export function askMediaNavigator(accountId: string | null, question: string): Promise<AskAnswer> {
  return apiRequest('/api/intelligence/ask', {
    method: 'POST',
    auth: true,
    json: { accountId, question, tz: deviceTimeZone() },
  });
}
