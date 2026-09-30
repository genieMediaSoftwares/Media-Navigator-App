import { useEffect } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { AsyncContent } from '@/components/AsyncContent';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Divider } from '@/components/ui/Divider';
import { colors } from '@/constants/colors';
import { fetchNotifications, markNotificationsRead } from '@/features/notifications/api';
import { useApiResource } from '@/hooks/useApiResource';
import { formatDate } from '@/lib/format';
import { AppNotification } from '@/types/api';

function NotificationRow({ notification }: { notification: AppNotification }) {
  const unread = notification.readAt === null;
  return (
    <View
      className="flex-row py-lg"
      accessible
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}. ${notification.body}. ${formatDate(notification.createdAt)}`}
    >
      <View className={`mr-md mt-sm h-2 w-2 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`} />
      <View className="flex-1">
        <Text className={`text-body text-navy ${unread ? 'font-semibold' : ''}`}>{notification.title}</Text>
        <Text className="mt-xs text-label font-normal text-neutral-500">{notification.body}</Text>
        <Text className="mt-xs text-caption text-neutral-500">
          {formatDate(notification.createdAt)}
          {unread ? ' · Unread' : ''}
        </Text>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const { state, refreshing, reload, refresh } = useApiResource(fetchNotifications);

  // Once shown, unread notifications are marked read on the server; this screen keeps its unread dots until refreshed.
  useEffect(() => {
    if (state.status !== 'success') return;
    const unread = state.data.filter((n) => n.readAt === null).map((n) => n.id);
    if (unread.length > 0) markNotificationsRead(unread).catch(() => undefined);
  }, [state]);

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-xl pb-3xl pt-lg"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <AsyncContent
        state={state}
        onRetry={reload}
        loading={<LoadingState message="Loading notifications…" />}
        unavailable={{ icon: 'notifications-outline', title: 'No notifications yet.' }}
        isEmpty={(notifications) => notifications.length === 0}
        empty={<EmptyState icon="notifications-outline" title="No notifications yet." message="Account and insight updates will appear here." />}
      >
        {(notifications) =>
          notifications.map((notification, index) => (
            <View key={notification.id}>
              {index > 0 ? <Divider /> : null}
              <NotificationRow notification={notification} />
            </View>
          ))
        }
      </AsyncContent>
    </ScrollView>
  );
}
