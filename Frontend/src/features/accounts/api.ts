import { apiRequest } from '@/lib/api/client';
import {
  AccountsResponse,
  ConnectedAccount,
  ConnectResponse,
  InstagramDashboardData,
  PendingSelection,
  SocialPlatform,
  SyncSummary,
} from '@/types/api';
import { SyncStatusSummary } from '@/types/analysis';

export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const { accounts } = await apiRequest<AccountsResponse>('/api/accounts', { auth: true });
  return accounts;
}

/**
 * Connects a platform with a user-supplied access token (Instagram, Facebook). Without a token the
 * server answers with an OAuth authorization URL instead.
 */
export function startAccountConnection(platform: SocialPlatform, accessToken?: string): Promise<ConnectResponse> {
  return apiRequest<ConnectResponse>('/api/accounts/connect', {
    method: 'POST',
    auth: true,
    json: { platform, ...(accessToken && { accessToken }) },
  });
}

/** OAuth authorization URL for the platform. The server redirects back to `returnUrl` (an app link) when done. */
export function fetchAuthorizationUrl(platform: SocialPlatform, returnUrl: string): Promise<{ authorizationUrl: string }> {
  return apiRequest(`/api/accounts/connect/${platform}?returnUrl=${encodeURIComponent(returnUrl)}`, { auth: true });
}

export async function fetchPendingSelection(id: string): Promise<PendingSelection> {
  const { selection } = await apiRequest<{ selection: PendingSelection }>(`/api/accounts/pending/${encodeURIComponent(id)}`, { auth: true });
  return selection;
}

export function selectPendingAccount(id: string, platformAccountId: string): Promise<Required<Pick<ConnectResponse, 'account'>>> {
  return apiRequest(`/api/accounts/pending/${encodeURIComponent(id)}/select`, { method: 'POST', auth: true, json: { platformAccountId } });
}

/** Disconnects a connected account by ID. */
export function disconnectAccount(id: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/accounts/${id}`, { method: 'DELETE', auth: true });
}

/** Triggers data sync for a connected account. Without a mode the server picks full or incremental. */
export function syncAccount(id: string, mode?: 'full' | 'incremental'): Promise<SyncSummary> {
  return apiRequest<SyncSummary>(`/api/accounts/${id}/sync${mode ? `?mode=${mode}` : ''}`, { method: 'POST', auth: true });
}

/** Last sync run, stored vs reported content counts and sync notes. */
export function fetchSyncStatus(id: string): Promise<SyncStatusSummary> {
  return apiRequest<SyncStatusSummary>(`/api/accounts/${id}/sync-status`, { auth: true });
}

/** Fetches full account dashboard data (profile metrics, synced media posts, sync status). */
export function fetchAccountDashboard(id: string): Promise<InstagramDashboardData> {
  return apiRequest<InstagramDashboardData>(`/api/accounts/${id}/dashboard`, { auth: true });
}
