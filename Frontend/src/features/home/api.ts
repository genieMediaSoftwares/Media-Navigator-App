import { apiRequest } from '@/lib/api/client';
import { HomeOverview } from '@/types/api';

export function fetchHomeOverview(): Promise<HomeOverview> {
  return apiRequest<HomeOverview>('/api/overview', { auth: true });
}
