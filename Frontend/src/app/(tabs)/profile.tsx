import { useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { ListRow } from '@/components/ListRow';
import { TabScreen } from '@/components/TabScreen';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { Gradient } from '@/components/visual/Gradient';
import { useAuth } from '@/features/auth/auth-context';
import { initials } from '@/lib/format';

const NOT_AVAILABLE = 'Not available yet';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-xl">
      <Text className="mb-sm px-xs text-caption font-semibold uppercase tracking-wide text-neutral-500" accessibilityRole="header">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl bg-neutral-50">{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (state.status !== 'authenticated') return null;
  const { user } = state;
  const name = user.profile?.displayName ?? null;

  async function performSignOut() {
    setSigningOut(true);
    // Calls POST /api/auth/logout, then clears the SecureStore token.
    const { serverRevoked } = await signOut();
    if (!serverRevoked) {
      Alert.alert('Signed out on this device', 'The server could not be reached to end your session. It will expire automatically.');
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need to sign in again to use Media Navigator.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void performSignOut() },
    ]);
  }

  return (
    <TabScreen showLogo title="Profile">
      <View className="mb-2xl flex-row items-center">
        <Gradient
          name="ai"
          style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text className="text-heading text-white" importantForAccessibility="no">
            {initials(name ?? user.email)}
          </Text>
        </Gradient>
        <View className="ml-lg flex-1">
          {name ? <Text className="text-heading text-navy">{name}</Text> : null}
          <Text className="mt-xs text-body text-neutral-500" selectable>
            {user.email}
          </Text>
        </View>
      </View>

      <Group title="Account">
        <ListRow icon="link-outline" label="Connected Accounts" onPress={() => router.push('/connected-accounts')} />
        <Divider inset />
        <ListRow icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} />
        <Divider inset />
        <ListRow icon="shield-checkmark-outline" label="Security" status={NOT_AVAILABLE} />
        <Divider inset />
        <ListRow icon="options-outline" label="Preferences" status={NOT_AVAILABLE} />
      </Group>

      <Group title="Support">
        <ListRow icon="help-circle-outline" label="Help" status={NOT_AVAILABLE} />
        <Divider inset />
        <ListRow icon="lock-closed-outline" label="Privacy Policy" status={NOT_AVAILABLE} />
        <Divider inset />
        <ListRow icon="document-text-outline" label="Terms" status={NOT_AVAILABLE} />
      </Group>

      <Button title="Sign out" icon="log-out-outline" variant="danger" onPress={confirmSignOut} loading={signingOut} />
    </TabScreen>
  );
}
