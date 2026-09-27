import { apiRequest } from '@/lib/api/client';
import { AppNotification, NotificationsResponse } from '@/types/api';

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { notifications } = await apiRequest<NotificationsResponse>('/api/notifications', { auth: true });
  return notifications;
}
