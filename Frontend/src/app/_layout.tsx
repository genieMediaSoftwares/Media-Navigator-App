import '../global.css';
import '@/lib/nativewind-interop';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FullScreenError, SplashView } from '@/components/FullScreenStatus';
import { colors } from '@/constants/colors';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

// Native header for screens pushed on top of the tabs.
const pushedScreenOptions = {
  headerShown: true,
  headerTintColor: colors.navy,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  headerStyle: { backgroundColor: colors.white },
  contentStyle: { backgroundColor: colors.white },
} as const;

function RootNavigator() {
  const { state, restoreSession, signOut } = useAuth();

  if (state.status === 'loading') return <SplashView />;

  if (state.status === 'error') {
    return (
      <FullScreenError
        title="Unable to verify your session"
        message={state.message}
        onRetry={restoreSession}
        secondaryAction={{ label: 'Sign out', onPress: () => void signOut() }}
      />
    );
  }

  // Client-side guards only decide which screens are reachable. The server is the source of
  // truth: every protected request is re-authenticated, and a 401 signs the user out here.
  const isAuthenticated = state.status === 'authenticated';

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="connected-accounts" options={{ ...pushedScreenOptions, title: 'Connected accounts' }} />
        <Stack.Screen name="notifications" options={{ ...pushedScreenOptions, title: 'Notifications' }} />
        <Stack.Screen name="connect/instagram" options={{ ...pushedScreenOptions, title: 'Instagram' }} />
        <Stack.Screen name="connect/[platform]" options={{ ...pushedScreenOptions, title: '' }} />
        <Stack.Screen name="oauth/callback" options={{ ...pushedScreenOptions, title: 'Connect account' }} />
        <Stack.Screen name="settings/security" options={{ ...pushedScreenOptions, title: 'Security' }} />
        <Stack.Screen name="settings/preferences" options={{ ...pushedScreenOptions, title: 'Preferences' }} />
        <Stack.Screen name="settings/help" options={{ ...pushedScreenOptions, title: 'Help' }} />
        <Stack.Screen name="settings/privacy" options={{ ...pushedScreenOptions, title: 'Privacy Policy' }} />
        <Stack.Screen name="settings/terms" options={{ ...pushedScreenOptions, title: 'Terms' }} />
        <Stack.Screen name="intelligence/library" options={{ ...pushedScreenOptions, title: 'Content library' }} />
        <Stack.Screen name="intelligence/post/[id]" options={{ ...pushedScreenOptions, title: 'Post performance' }} />
        <Stack.Screen name="intelligence/insight/[id]" options={{ ...pushedScreenOptions, title: 'AI insight' }} />
        <Stack.Screen name="intelligence/formats" options={{ ...pushedScreenOptions, title: 'Formats' }} />
        <Stack.Screen name="intelligence/trends" options={{ ...pushedScreenOptions, title: 'Patterns' }} />
        {/* Ask renders its own header so the composer can sit exactly above the keyboard. */}
        <Stack.Screen name="intelligence/ask" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
    </Stack>
  );
}
