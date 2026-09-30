import { apiRequest } from '@/lib/api/client';
import { AppNotification, NotificationsResponse } from '@/types/api';

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { notifications } = await apiRequest<NotificationsResponse>('/api/notifications', { auth: true });
  return notifications;
}

/** Marks the given notifications (or all when omitted) as read. */
export function markNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
  return apiRequest('/api/notifications/read', { method: 'POST', auth: true, json: ids ? { ids } : {} });
}
