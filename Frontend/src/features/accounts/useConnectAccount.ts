import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { ApiError } from '@/lib/api/client';
import { ConnectedAccount, SocialPlatform } from '@/types/api';

import { fetchAuthorizationUrl, startAccountConnection } from './api';
import { platformOption } from './platforms';

const CALLBACK_PARAMS = ['status', 'platform', 'accountId', 'selectionId', 'message'] as const;

/**
 * Connects platforms through the Media Navigator server, which validates everything with the
 * platform and stores credentials encrypted. Nothing secret is kept on the device.
 */
export function useConnectAccount() {
  const router = useRouter();
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);

  const showError = useCallback((platform: SocialPlatform, error: unknown) => {
    const { name } = platformOption(platform);
    const unavailable = error instanceof ApiError && (error.status === 501 || error.code === 'CONFIG_ERROR');
    Alert.alert(
      unavailable ? `${name} connection isn't available yet` : `Unable to connect ${name}`,
      error instanceof Error ? error.message : 'Please check your access token and try again.',
    );
  }, []);

  /** Connects with a pasted access token. Returns the account, or undefined when a choice or an error followed. */
  const connectToken = useCallback(
    async (platform: SocialPlatform, accessToken: string): Promise<ConnectedAccount | undefined> => {
      setConnecting(platform);
      try {
        const res = await startAccountConnection(platform, accessToken);
        if (res.selection) {
          router.push({ pathname: '/oauth/callback', params: { status: 'select', platform, selectionId: res.selection.id } });
          return undefined;
        }
        return res.account as ConnectedAccount | undefined;
      } catch (error) {
        showError(platform, error);
        return undefined;
      } finally {
        setConnecting(null);
      }
    },
    [router, showError],
  );

  /**
   * Opens the platform's sign-in in a secure browser session. The server finishes the OAuth exchange
   * and redirects back to this app; the result screen handles success, errors and account choice.
   */
  const connectOAuth = useCallback(
    async (platform: SocialPlatform): Promise<void> => {
      setConnecting(platform);
      try {
        const returnUrl = Linking.createURL('oauth/callback');
        const { authorizationUrl } = await fetchAuthorizationUrl(platform, returnUrl);
        const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, returnUrl);
        if (result.type !== 'success') return;
        const { queryParams } = Linking.parse(result.url);
        const params: Record<string, string> = {};
        for (const key of CALLBACK_PARAMS) {
          const value = queryParams?.[key];
          if (typeof value === 'string') params[key] = value;
        }
        router.push({ pathname: '/oauth/callback', params });
      } catch (error) {
        showError(platform, error);
      } finally {
        setConnecting(null);
      }
    },
    [router, showError],
  );

  return { connectToken, connectOAuth, connecting };
}
