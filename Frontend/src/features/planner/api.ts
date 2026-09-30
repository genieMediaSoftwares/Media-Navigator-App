import { apiRequest } from '@/lib/api/client';
import { deviceTimeZone } from '@/lib/timezone';
import { PlannerInsights } from '@/types/api';

/** Measured timing for `accountId`, or for the default account when omitted. */
export function fetchPlannerInsights(accountId?: string | null): Promise<PlannerInsights> {
  const account = accountId ? `&accountId=${encodeURIComponent(accountId)}` : '';
  return apiRequest<PlannerInsights>(`/api/planner/insights?tz=${encodeURIComponent(deviceTimeZone())}${account}`, { auth: true });
}
