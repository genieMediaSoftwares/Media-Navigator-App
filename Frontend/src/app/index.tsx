import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';

// Entry route. It renders nothing itself and sends the user to the area their session allows.
// It is also where the Stack.Protected guards fall back to when a guard flips.
export default function Index() {
  const { state } = useAuth();
  return <Redirect href={state.status === 'authenticated' ? '/(tabs)' : '/auth/login'} />;
}
