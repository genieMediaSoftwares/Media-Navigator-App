import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Gradient } from '@/components/visual/Gradient';
import { FadeIn } from '@/components/visual/Motion';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { disconnectAccount, fetchConnectedAccounts } from '@/features/accounts/api';
import { useConnectAccount } from '@/features/accounts/useConnectAccount';
import { useApiResource } from '@/hooks/useApiResource';
import { ConnectedAccount, SocialPlatform } from '@/types/api';
import { blueprintOf } from '../blueprint';

interface PlatformConnectViewProps {
  platform: SocialPlatform;
  onConnected?: () => void;
}

interface DeveloperSetupConfig {
  title: string;
  description: string;
  buttonTitle: string;
  url: string;
}

const DEVELOPER_SETUP_CONFIG: Record<SocialPlatform, DeveloperSetupConfig> = {
  instagram: {
    title: 'Get your Instagram access token',
    description:
      'Use Meta Graph API Explorer to generate the User Access Token required to connect your Instagram account.',
    buttonTitle: 'Get token from Meta',
    url: 'https://business.facebook.com/business/loginpage/?next=https%3A%2F%2Fdevelopers.facebook.com%2Ftools%2Fexplorer%2F#',
  },
  facebook: {
    title: 'Open Meta Developer Tools',
    description:
      'Need to configure your Meta app or credentials? Open Meta Developer Tools to manage your app setup.',
    buttonTitle: 'Open Meta Developer Tools',
    url: 'https://business.facebook.com/business/loginpage/?next=https%3A%2F%2Fdevelopers.facebook.com%2Ftools%2Fexplorer%2F#',
  },
  youtube: {
    title: 'Google Cloud credentials',
    description:
      'Need to configure your YouTube integration? Open Google Cloud Console to manage your OAuth credentials.',
    buttonTitle: 'Open Google Cloud Console',
    url: 'https://console.google.com/apis/credentials',
  },
  linkedin: {
    title: 'LinkedIn Developer Portal',
    description:
      'Need to configure your LinkedIn application? Open the LinkedIn Developer Portal.',
    buttonTitle: 'Open LinkedIn Developer Portal',
    url: 'https://www.linkedin.com/developers/login',
  },
};

const HERO_COPY: Record<SocialPlatform, { headline: string; description: string }> = {
  instagram: {
    headline: 'Connect your Instagram account',
    description:
      'Connect your real Instagram account to bring your social data into Media Navigator for performance analysis.',
  },
  facebook: {
    headline: 'Bring your Facebook Page into Media Navigator',
    description: "See what's working, what needs attention, and ask AI about your real content.",
  },
  youtube: {
    headline: 'Bring your YouTube channel into Media Navigator',
    description: "See what's working, what needs attention, and ask AI about your real content.",
  },
  linkedin: {
    headline: 'Bring your LinkedIn page into Media Navigator',
    description: "See what's working, what needs attention, and ask AI about your real content.",
  },
};

export function PlatformConnectView({ platform, onConnected }: PlatformConnectViewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const devConfig = DEVELOPER_SETUP_CONFIG[platform];
  const heroCopy = HERO_COPY[platform];

  const { connectOAuth, connectToken, connecting } = useConnectAccount();
  const { state: accountsState, reload: reloadAccounts } = useApiResource(fetchConnectedAccounts);

  const connectedAccount =
    accountsState.status === 'success'
      ? accountsState.data.find((a: ConnectedAccount) => a.platform === platform) ?? null
      : null;

  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConnecting = Boolean(connecting);

  const openExternalUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Unable to open browser', 'Unable to open the developer page. Please try again.');
      }
    } catch {
      Alert.alert('Unable to open browser', 'Unable to open the developer page. Please try again.');
    }
  };

  const handleSignIn = async () => {
    await connectOAuth(platform);
  };

  const handleTokenSubmit = async () => {
    const clean = token.trim();
    if (!clean) {
      setTokenError(`${bp.name} access token is required`);
      return;
    }
    setTokenError(null);
    const result = await connectToken(platform, clean);
    if (result) {
      setToken('');
      await reloadAccounts();
      if (onConnected) {
        await onConnected();
      }
    }
  };

  const confirmDisconnect = (accountId: string) => {
    Alert.alert(`Disconnect ${bp.name}?`, `@${connectedAccount?.handle ?? ''} and its synced data will be removed from Media Navigator.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setIsDisconnecting(true);
          try {
            await disconnectAccount(accountId);
            await reloadAccounts();
            if (onConnected) {
              await onConnected();
            }
          } catch (err) {
            Alert.alert('Unable to disconnect', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setIsDisconnecting(false);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView className="flex-1" contentContainerClassName="pb-3xl" keyboardShouldPersistTaps="handled">
        {/* Top bar with back navigation if available */}
        <View className="flex-row items-center justify-between px-xl pt-lg pb-sm">
          {router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.navy} />
            </Pressable>
          ) : (
            <View className="w-10" />
          )}
          <Text className="text-title font-semibold text-navy">{bp.name}</Text>
          <View className="w-10" />
        </View>

        {/* Hero */}
        <Gradient
          name="brand"
          style={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
          }}
        >
          <FadeIn>
            <View className="h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: bp.accent }}>
              <Ionicons name={bp.icon} size={34} color={colors.white} />
            </View>
            <Text className="mt-xl text-display text-white">{heroCopy.headline}</Text>
            <Text className="mt-sm text-body" style={{ color: colors.onDarkMuted }}>
              {heroCopy.description}
            </Text>
          </FadeIn>
        </Gradient>

        <View className="px-xl pt-xl">
          {/* Currently Connected banner if account exists */}
          {connectedAccount ? (
            <FadeIn className="mb-xl rounded-2xl border border-success-border bg-success-light p-lg">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text className="ml-xs text-caption font-bold uppercase tracking-wider text-success">
                    Currently Connected
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmDisconnect(connectedAccount.id)}
                  disabled={isDisconnecting}
                  hitSlop={8}
                >
                  <Text className="text-caption font-semibold text-danger">
                    {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </Text>
                </Pressable>
              </View>
              <Text className="mt-sm text-title font-bold text-navy">@{connectedAccount.handle}</Text>
              {connectedAccount.displayName ? (
                <Text className="text-body text-neutral-500">{connectedAccount.displayName}</Text>
              ) : null}
            </FadeIn>
          ) : null}

          {/* Connection steps */}
          <Overline className="mb-lg">Setup & Connection</Overline>

          {platform === 'instagram' ? (
            <>
              {/* Instagram Step 1: Get Token */}
              <View className="mb-xl flex-row">
                <Gradient name="ai" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-label font-bold text-white">1</Text>
                </Gradient>
                <View className="ml-md flex-1">
                  <Text className="mb-sm text-title text-navy">Get your Instagram access token</Text>
                  <Text className="mb-md text-label font-normal text-neutral-500">
                    Use Meta Graph API Explorer to generate the User Access Token required to connect your Instagram account.
                  </Text>
                  <Button
                    title="Get token from Meta"
                    icon="open-outline"
                    variant="secondary"
                    size="sm"
                    onPress={() => void openExternalUrl(devConfig.url)}
                    accessibilityHint="Opens Meta Graph API Explorer in your browser"
                  />
                </View>
              </View>

              {/* Instagram Step 2: Paste Token & Connect */}
              <View className="mb-xl flex-row">
                <Gradient name="ai" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-label font-bold text-white">2</Text>
                </Gradient>
                <View className="ml-md flex-1">
                  <Text className="mb-sm text-title text-navy">Meta Graph API Token</Text>
                  <TextField
                    label="Meta Graph API Token"
                    placeholder="Paste your access token"
                    value={token}
                    onChangeText={(text) => {
                      setToken(text);
                      if (tokenError) setTokenError(null);
                    }}
                    secureToggle
                    error={tokenError}
                    hint="Paste your User Access Token from Meta Graph API Explorer"
                    editable={!isConnecting}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View className="mt-md">
                    <Button
                      title={isConnecting ? 'Connecting…' : 'Connect Instagram'}
                      onPress={() => void handleTokenSubmit()}
                      disabled={isConnecting || !token.trim()}
                      loading={isConnecting}
                    />
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              {/* OAuth Platform Step 1 */}
              <View className="mb-xl flex-row">
                <Gradient name="ai" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-label font-bold text-white">1</Text>
                </Gradient>
                <View className="ml-md flex-1">
                  <Text className="mb-sm text-title text-navy">Sign in with {bp.name}</Text>
                  <Text className="mb-md text-label font-normal text-neutral-500">{bp.connect.requirement}</Text>
                  <Button
                    title={isConnecting ? 'Opening sign-in…' : `Continue with ${bp.name}`}
                    icon={bp.icon}
                    onPress={() => void handleSignIn()}
                    loading={isConnecting}
                    disabled={isConnecting}
                  />
                </View>
              </View>

              {/* OAuth Platform Step 2 */}
              <View className="mb-xl flex-row">
                <Gradient name="ai" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-label font-bold text-white">2</Text>
                </Gradient>
                <View className="ml-md flex-1">
                  <Text className="mb-sm text-title text-navy">{bp.selectTitle}</Text>
                  <Text className="text-label font-normal text-neutral-500">{bp.selectHint}</Text>
                </View>
              </View>

              {/* Facebook optional token fallback */}
              {platform === 'facebook' ? (
                <View className="mb-xl rounded-2xl border border-neutral-200 p-lg">
                  <Text className="mb-sm text-title text-navy">Or use a Meta access token</Text>
                  <Text className="mb-md text-label font-normal text-neutral-500">
                    A Graph API access token with pages_show_list and pages_read_engagement permissions works too.
                  </Text>
                  <TextField
                    label="Meta Graph API Token"
                    placeholder="Paste token here"
                    value={token}
                    onChangeText={(text) => {
                      setToken(text);
                      if (tokenError) setTokenError(null);
                    }}
                    secureToggle
                    error={tokenError}
                    hint="Paste your Meta Graph API User Access Token"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button
                    title="Connect Facebook with Token"
                    variant="secondary"
                    onPress={() => void handleTokenSubmit()}
                    disabled={!token.trim() || isConnecting}
                    loading={isConnecting}
                  />
                </View>
              ) : null}

              {/* YouTube optional token fallback */}
              {platform === 'youtube' ? (
                <View className="mb-xl rounded-2xl border border-neutral-200 p-lg">
                  <Text className="mb-sm text-title text-navy">Or use a YouTube OAuth access token</Text>
                  <Text className="mb-md text-label font-normal text-neutral-500">
                    An OAuth 2.0 access token with YouTube Data API v3 and YouTube Analytics API permissions (youtube.readonly, yt-analytics.readonly) works too for content fetching and analysis.
                  </Text>
                  <TextField
                    label="OAuth 2.0 Client Token / Access Token"
                    placeholder="Paste token here"
                    value={token}
                    onChangeText={(text) => {
                      setToken(text);
                      if (tokenError) setTokenError(null);
                    }}
                    secureToggle
                    error={tokenError}
                    hint="Paste an OAuth access token with YouTube Data API v3 & Analytics API enabled"
                    editable={!isConnecting}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button
                    title="Connect YouTube with Token"
                    variant="secondary"
                    onPress={() => void handleTokenSubmit()}
                    disabled={!token.trim() || isConnecting}
                    loading={isConnecting}
                  />
                </View>
              ) : null}

              {/* LinkedIn optional token fallback */}
              {platform === 'linkedin' ? (
                <View className="mb-xl rounded-2xl border border-neutral-200 p-lg">
                  <Text className="mb-sm text-title text-navy">Or use a LinkedIn OAuth token</Text>
                  <Text className="mb-md text-label font-normal text-neutral-500">
                    A LinkedIn OAuth access token with Community Management API permissions (r_organization_admin, r_organization_social) works too for organization management.
                  </Text>
                  <TextField
                    label="LinkedIn OAuth Access Token"
                    placeholder="Paste token here"
                    value={token}
                    onChangeText={(text) => {
                      setToken(text);
                      if (tokenError) setTokenError(null);
                    }}
                    secureToggle
                    error={tokenError}
                    hint="Paste your User Access Token from LinkedIn Developer Portal / Community Management API"
                    editable={!isConnecting}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button
                    title="Connect LinkedIn with Token"
                    variant="secondary"
                    onPress={() => void handleTokenSubmit()}
                    disabled={!token.trim() || isConnecting}
                    loading={isConnecting}
                  />
                </View>
              ) : null}
            </>
          )}

          {/* Secondary Developer Setup Card */}
          <View className="mb-xl rounded-2xl border border-neutral-200 bg-neutral-50 p-lg">
            <Overline className="mb-xs">Developer setup</Overline>
            <Text className="mb-sm text-title text-navy">{devConfig.title}</Text>
            <Text className="mb-md text-label font-normal text-neutral-500">{devConfig.description}</Text>
            <Button
              title={devConfig.buttonTitle}
              icon="open-outline"
              variant="secondary"
              size="sm"
              onPress={() => void openExternalUrl(devConfig.url)}
            />
          </View>

          {/* Security Notice */}
          <View className="flex-row items-start rounded-2xl bg-neutral-50 p-lg">
            <Ionicons name="lock-closed" size={16} color={colors.success} />
            <Text className="ml-sm flex-1 text-caption text-neutral-500">
              {bp.connect.access} Access tokens are stored encrypted on the Media Navigator server and never on this device.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

