import { apiRequest } from '@/lib/api/client';
import { deviceTimeZone } from '@/lib/timezone';
import { PlannerInsights } from '@/types/api';

export function fetchPlannerInsights(): Promise<PlannerInsights> {
  return apiRequest<PlannerInsights>(`/api/planner/insights?tz=${encodeURIComponent(deviceTimeZone())}`, { auth: true });
}
