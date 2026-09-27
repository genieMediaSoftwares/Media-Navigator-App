import { apiRequest } from '@/lib/api/client';
import {
  AccountsResponse,
  ConnectAccountResult,
  ConnectedAccount,
  InstagramDashboardData,
  SocialPlatform,
  SyncSummary,
} from '@/types/api';

export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const { accounts } = await apiRequest<AccountsResponse>('/api/accounts', { auth: true });
  return accounts;
}

/** Connects a social account using a user-supplied access token or initiates connection flow. */
export function startAccountConnection(
  platform: SocialPlatform,
  accessToken?: string,
): Promise<{ account?: ConnectedAccount } & Partial<ConnectAccountResult>> {
  return apiRequest<{ account?: ConnectedAccount } & Partial<ConnectAccountResult>>('/api/accounts/connect', {
    method: 'POST',
    auth: true,
    json: { platform, ...(accessToken && { accessToken }) },
  });
}

/** Disconnects a connected account by ID. */
export function disconnectAccount(id: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/accounts/${id}`, { method: 'DELETE', auth: true });
}

/** Triggers data sync for a connected account. */
export function syncAccount(id: string): Promise<SyncSummary> {
  return apiRequest<SyncSummary>(`/api/accounts/${id}/sync`, { method: 'POST', auth: true });
}

/** Fetches full account dashboard data (profile metrics, synced media posts, sync status). */
export function fetchAccountDashboard(id: string): Promise<InstagramDashboardData> {
  return apiRequest<InstagramDashboardData>(`/api/accounts/${id}/dashboard`, { auth: true });
}
