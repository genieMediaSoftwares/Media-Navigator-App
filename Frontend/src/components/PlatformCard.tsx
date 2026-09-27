import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { PlatformOption } from '@/features/accounts/platforms';
import { ConnectedAccount, ConnectionStatus } from '@/types/api';

import { Button } from './ui/Button';

interface PlatformCardProps {
  platform: PlatformOption;
  /**
   * Connection reported by the API:
   * - ConnectedAccount: the backend says this platform is connected
   * - null: the backend says it is not connected
   * - undefined: unknown (accounts could not be loaded); no status is shown
   */
  connection: ConnectedAccount | null | undefined;
  onConnect: () => void;
  onManage?: () => void;
  onDisconnect?: () => void;
  connecting?: boolean;
  disconnecting?: boolean;
}

const STATUS_LABELS: Record<ConnectionStatus, { label: string; icon: 'checkmark-circle' | 'warning-outline' | 'alert-circle-outline'; color: string; text: string }> = {
  connected: { label: 'Connected', icon: 'checkmark-circle', color: colors.success, text: 'text-success' },
  reauthorization_required: { label: 'Reconnect required', icon: 'warning-outline', color: colors.warning, text: 'text-warning' },
  error: { label: 'Connection error', icon: 'alert-circle-outline', color: colors.danger, text: 'text-danger' },
};

/** One platform in the connection list. Connect is an action that navigates to a dedicated connection screen. */
export function PlatformCard({
  platform,
  connection,
  onConnect,
  onManage,
  onDisconnect,
  connecting = false,
  disconnecting = false,
}: PlatformCardProps) {
  const status = connection ? STATUS_LABELS[connection.status] : null;
  const isConnected = connection && connection.status === 'connected';

  return (
    <View className="flex-row items-center py-md">
      <View className="h-11 w-11 items-center justify-center rounded-md bg-neutral-100">
        <Ionicons name={platform.icon} size={22} color={colors.navy} />
      </View>
      <View className="ml-md flex-1 pr-md">
        <Text className="text-body font-semibold text-navy">{platform.name}</Text>
        {connection && status ? (
          <View className="mt-xs flex-row items-center">
            <Ionicons name={status.icon} size={14} color={status.color} />
            <Text className={`ml-xs flex-shrink text-caption ${status.text}`} numberOfLines={1}>
              {status.label} · @{connection.handle}
            </Text>
          </View>
        ) : connection === null ? (
          <Text className="mt-xs text-caption text-neutral-500">Not connected</Text>
        ) : null}
      </View>

      {isConnected ? (
        onManage ? (
          <Button
            title="Manage"
            size="sm"
            variant="secondary"
            onPress={onManage}
            accessibilityHint={`Manage your ${platform.name} connection`}
          />
        ) : onDisconnect ? (
          <Button
            title="Disconnect"
            size="sm"
            variant="ghost"
            onPress={onDisconnect}
            loading={disconnecting}
            accessibilityHint={`Disconnects your ${platform.name} account`}
          />
        ) : null
      ) : (
        <Button
          title={connection ? 'Reconnect' : 'Connect'}
          size="sm"
          variant="secondary"
          onPress={onConnect}
          loading={connecting}
          accessibilityHint={`Starts connecting your ${platform.name} account`}
        />
      )}
    </View>
  );
}
