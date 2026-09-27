import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { ApiError } from '@/lib/api/client';
import { ConnectedAccount, SocialPlatform } from '@/types/api';

import { startAccountConnection } from './api';
import { platformOption } from './platforms';

/**
 * Connects a platform through the Worker API using a user-supplied access token.
 * Manages loading states and handles API errors safely without exposing credentials.
 */
export function useConnectAccount() {
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);

  const connectToken = useCallback(
    async (platform: SocialPlatform, accessToken: string): Promise<ConnectedAccount | undefined> => {
      const { name } = platformOption(platform);
      setConnecting(platform);
      try {
        const res = await startAccountConnection(platform, accessToken);
        return res.account;
      } catch (error) {
        const unavailable = error instanceof ApiError && error.status === 501;

        let title = `Unable to connect ${name}`;
        let message = error instanceof Error ? error.message : 'Please check your access token and try again.';

        if (unavailable) {
          title = `${name} connection isn't available yet`;
        }

        Alert.alert(title, message);
        return undefined;
      } finally {
        setConnecting(null);
      }
    },
    [],
  );

  return { connectToken, connecting };
}
