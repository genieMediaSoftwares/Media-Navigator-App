import { apiRequest } from '@/lib/api/client';
import { User, UserPreferences } from '@/types/api';

export async function updateDisplayName(displayName: string): Promise<User> {
  const { user } = await apiRequest<{ user: User }>('/api/profile', { method: 'PATCH', auth: true, json: { displayName } });
  return user;
}

export async function fetchPreferences(): Promise<UserPreferences> {
  const { preferences } = await apiRequest<{ preferences: UserPreferences }>('/api/profile/preferences', { auth: true });
  return preferences;
}

export async function updatePreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
  const { preferences } = await apiRequest<{ preferences: UserPreferences }>('/api/profile/preferences', { method: 'PATCH', auth: true, json: updates });
  return preferences;
}

export async function fetchActiveSessionCount(): Promise<number> {
  const { activeSessions } = await apiRequest<{ activeSessions: number }>('/api/auth/sessions', { auth: true });
  return activeSessions;
}

/** Changes the password; other signed-in devices are signed out by the server. */
export function changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ otherSessionsRevoked: number }> {
  return apiRequest('/api/auth/change-password', { method: 'POST', auth: true, json: input });
}

export function signOutOtherDevices(): Promise<{ otherSessionsRevoked: number }> {
  return apiRequest('/api/auth/logout-others', { method: 'POST', auth: true });
}

/** Permanently deletes the account and everything stored for it. */
export function deleteAccount(password: string): Promise<{ deleted: true }> {
  return apiRequest('/api/auth/delete-account', { method: 'POST', auth: true, json: { password } });
}
