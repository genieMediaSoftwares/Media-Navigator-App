import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { TextField } from '@/components/ui/TextField';
import { colors } from '@/constants/colors';
import { useAuth } from '@/features/auth/auth-context';
import { validateDisplayName } from '@/features/auth/validation';
import { fetchPreferences, updateDisplayName, updatePreferences } from '@/features/profile/api';
import { useApiResource } from '@/hooks/useApiResource';
import { deviceTimeZone } from '@/lib/timezone';
import { UserPreferences } from '@/types/api';

type Toggle = 'notifySyncResults' | 'notifyAiInsights' | 'notifyConnectionIssues';

const TOGGLES: Array<{ key: Toggle; label: string; description: string }> = [
  { key: 'notifySyncResults', label: 'Sync results', description: 'When a sync finishes or fails.' },
  { key: 'notifyConnectionIssues', label: 'Connection problems', description: 'When a connected account needs to be reconnected.' },
  { key: 'notifyAiInsights', label: 'Insights', description: 'New AI insights and posts performing far above your average.' },
];

export default function PreferencesScreen() {
  const { state: auth, updateUser } = useAuth();
  const { state, reload } = useApiResource(fetchPreferences);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [name, setName] = useState(auth.status === 'authenticated' ? (auth.user.profile?.displayName ?? '') : '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (state.status === 'success') setPreferences(state.data);
  }, [state]);

  const saveName = async () => {
    const error = validateDisplayName(name);
    setNameError(error);
    if (error) return;
    setSavingName(true);
    try {
      updateUser(await updateDisplayName(name.trim()));
      Alert.alert('Saved', 'Your name was updated.');
    } catch (err) {
      Alert.alert('Unable to save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const toggle = async (key: Toggle, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    try {
      setPreferences(await updatePreferences({ [key]: value }));
    } catch (err) {
      setPreferences(previous);
      Alert.alert('Unable to save', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const currentName = auth.status === 'authenticated' ? (auth.user.profile?.displayName ?? '') : '';

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView className="flex-1" contentContainerClassName="px-xl pb-3xl pt-lg" keyboardShouldPersistTaps="handled">
        <Text className="mb-lg text-title text-navy" accessibilityRole="header">
          Profile
        </Text>
        <TextField label="Name" value={name} onChangeText={setName} error={nameError} autoComplete="name" maxLength={80} />
        <Button title="Save name" variant="secondary" onPress={() => void saveName()} loading={savingName} disabled={savingName || name.trim() === currentName} />

        <Text className="mb-xs mt-2xl text-title text-navy" accessibilityRole="header">
          Notifications
        </Text>
        <Text className="mb-lg text-label font-normal text-neutral-500">Choose which events appear in your notifications.</Text>
        {state.status === 'loading' ? <LoadingState message="Loading preferences…" /> : null}
        {state.status === 'error' || state.status === 'unavailable' ? <ErrorState message={state.message} onRetry={reload} /> : null}
        {preferences ? (
          <View className="overflow-hidden rounded-2xl bg-neutral-50">
            {TOGGLES.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? <Divider inset /> : null}
                <View className="min-h-16 flex-row items-center px-lg py-md">
                  <View className="mr-md flex-1">
                    <Text className="text-body text-navy">{item.label}</Text>
                    <Text className="mt-xs text-caption text-neutral-500">{item.description}</Text>
                  </View>
                  <Switch
                    value={preferences[item.key]}
                    onValueChange={(value) => void toggle(item.key, value)}
                    trackColor={{ true: colors.primary, false: colors.neutral200 }}
                    accessibilityLabel={`${item.label} notifications`}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="mb-xs mt-2xl text-title text-navy" accessibilityRole="header">
          Time zone
        </Text>
        <Text className="text-label font-normal text-neutral-500">
          Timing patterns and the planner use this device’s time zone: {deviceTimeZone()}.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
