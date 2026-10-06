import { apiRequest } from '@/lib/api/client';
import { deviceTimeZone } from '@/lib/timezone';
import {
  AiTrendInterpretation,
  DashboardResponse,
  PerformanceAnalysisResponse,
  PerformersPage,
  PerformerType,
  TimingResponse,
  TrendsResponse,
  VideoAnalysisResponse,
} from '@/types/analysis';
import { ContentFormat } from '@/types/api';

// Analysis data comes only from the server: measured numbers are computed there from synced data,
// and AI text is generated there (server → Gemini). The app never calls Gemini or Meta directly.

function query(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function fetchDashboard(accountId: string | null): Promise<DashboardResponse> {
  return apiRequest(`/api/intelligence/dashboard${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchTiming(accountId: string | null): Promise<TimingResponse> {
  return apiRequest(`/api/intelligence/timing${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchPerformers(params: { accountId: string; type: PerformerType; format?: ContentFormat | null; offset?: number; limit?: number }): Promise<PerformersPage> {
  return apiRequest(`/api/intelligence/performers${query({ ...params, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchTrends(accountId: string): Promise<TrendsResponse> {
  return apiRequest(`/api/intelligence/trends${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchTrendsAi(accountId: string): Promise<AiTrendInterpretation> {
  return apiRequest(`/api/intelligence/trends/ai${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchPerformanceAnalysis(accountId: string | null, postId: string, kind: PerformerType | null): Promise<PerformanceAnalysisResponse> {
  return apiRequest(`/api/intelligence/media/${encodeURIComponent(postId)}/performance-analysis${query({ accountId, kind, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchVideoAnalysis(accountId: string | null, postId: string): Promise<VideoAnalysisResponse> {
  return apiRequest(`/api/intelligence/media/${encodeURIComponent(postId)}/video-analysis${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}
