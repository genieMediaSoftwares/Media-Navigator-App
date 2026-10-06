import { apiRequest } from '@/lib/api/client';
import { deviceTimeZone } from '@/lib/timezone';
import {
  AiTrendInterpretation,
  AnalysisContentPage,
  AnalysisPeriod,
  AnalysisResponse,
  DashboardResponse,
  PerformanceAnalysisResponse,
  PerformerType,
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

export function fetchTrendsAi(accountId: string): Promise<AiTrendInterpretation> {
  return apiRequest(`/api/intelligence/trends/ai${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchPerformanceAnalysis(accountId: string | null, postId: string, kind: PerformerType | null): Promise<PerformanceAnalysisResponse> {
  return apiRequest(`/api/intelligence/media/${encodeURIComponent(postId)}/performance-analysis${query({ accountId, kind, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchVideoAnalysis(accountId: string | null, postId: string): Promise<VideoAnalysisResponse> {
  return apiRequest(`/api/intelligence/media/${encodeURIComponent(postId)}/video-analysis${query({ accountId, tz: deviceTimeZone() })}`, { auth: true });
}

export function fetchAnalysis(scope: string | null, period: AnalysisPeriod): Promise<AnalysisResponse> {
  return apiRequest(`/api/intelligence/analysis${query({ scope, period, tz: deviceTimeZone() })}`, { auth: true });
}

/** Content cards for the Analysis tabs; `accountId` narrows "all" to one platform. */
export function fetchAnalysisContent(params: { scope: string; period: AnalysisPeriod; type: 'top' | 'improve'; accountId?: string | null; limit?: number }): Promise<AnalysisContentPage> {
  return apiRequest(`/api/intelligence/analysis/content${query({ ...params, tz: deviceTimeZone() })}`, { auth: true });
}
