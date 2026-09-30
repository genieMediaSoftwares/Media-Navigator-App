import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/features/auth/auth-context';
import { validateNewPassword } from '@/features/auth/validation';
import { changePassword, deleteAccount, fetchActiveSessionCount, signOutOtherDevices } from '@/features/profile/api';
import { useApiResource } from '@/hooks/useApiResource';
import { ApiError } from '@/lib/api/client';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <View className="mb-2xl">
      <Text className="text-title text-navy" accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text className="mb-lg mt-xs text-label font-normal text-neutral-500">{description}</Text> : <View className="mb-lg" />}
      {children}
    </View>
  );
}

export default function SecurityScreen() {
  const { signOut } = useAuth();
  const sessions = useApiResource(fetchActiveSessionCount);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const submitPassword = async () => {
    const nextError = validateNewPassword(next);
    const found = {
      current: current ? undefined : 'Enter your current password.',
      next: nextError ?? undefined,
      confirm: confirm === next ? undefined : 'Passwords do not match.',
    };
    setErrors(found);
    if (found.current || found.next || found.confirm) return;
    setSaving(true);
    try {
      const { otherSessionsRevoked } = await changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      await sessions.refresh();
      Alert.alert('Password changed', otherSessionsRevoked > 0 ? `${otherSessionsRevoked} other signed-in ${otherSessionsRevoked === 1 ? 'device was' : 'devices were'} signed out.` : 'Your password was updated.');
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setErrors({ current: error.fields.currentPassword, next: error.fields.newPassword });
      } else {
        Alert.alert('Unable to change password', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOutOthers = useCallback(() => {
    Alert.alert('Sign out other devices?', 'Every other device signed in to your account will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out others',
        style: 'destructive',
        onPress: async () => {
          setSigningOutOthers(true);
          try {
            const { otherSessionsRevoked } = await signOutOtherDevices();
            await sessions.refresh();
            Alert.alert('Done', otherSessionsRevoked > 0 ? `${otherSessionsRevoked} ${otherSessionsRevoked === 1 ? 'device was' : 'devices were'} signed out.` : 'No other devices were signed in.');
          } catch (error) {
            Alert.alert('Unable to sign out other devices', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            setSigningOutOthers(false);
          }
        },
      },
    ]);
  }, [sessions]);

  const confirmDelete = () => {
    if (!deletePassword) {
      Alert.alert('Enter your password', 'Confirm with your password to delete your account.');
      return;
    }
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your Media Navigator account, disconnects every social account and removes all synced data, AI results and notifications. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount(deletePassword);
              await signOut();
            } catch (error) {
              setDeleting(false);
              Alert.alert('Unable to delete account', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const sessionCount = sessions.state.status === 'success' ? sessions.state.data : null;

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView className="flex-1" contentContainerClassName="px-xl pb-3xl pt-lg" keyboardShouldPersistTaps="handled">
        <Section title="Change password" description="Changing your password signs out every other device.">
          <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" error={errors.current} />
          <TextField label="New password" value={next} onChangeText={setNext} secureToggle autoCapitalize="none" autoComplete="new-password" error={errors.next} hint="At least 8 characters." />
          <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoComplete="new-password" error={errors.confirm} />
          <Button title="Update password" onPress={() => void submitPassword()} loading={saving} disabled={saving} />
        </Section>

        <Section title="Signed-in devices" description="Sessions expire automatically after 30 days.">
          <Text className="mb-lg text-body text-navy">
            {sessionCount === null ? 'Checking…' : `${sessionCount} ${sessionCount === 1 ? 'device is' : 'devices are'} signed in, including this one.`}
          </Text>
          <Button title="Sign out other devices" variant="secondary" onPress={confirmSignOutOthers} loading={signingOutOthers} disabled={signingOutOthers || sessionCount === 1} />
        </Section>

        <Section title="Delete account">
          <Notice variant="error" message="Deleting your account permanently removes your profile, connected accounts, stored access tokens, synced content, AI results and notifications." />
          <TextField label="Confirm with your password" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry autoCapitalize="none" />
          <Button title="Delete my account" variant="danger" onPress={confirmDelete} loading={deleting} disabled={deleting} />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
