import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { TextLink } from '@/components/ui/TextLink';
import { useAuth } from '@/features/auth/auth-context';
import { validateEmail } from '@/features/auth/validation';
import { ApiError, FieldErrors } from '@/lib/api/client';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const errors: FieldErrors = {};
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
    if (!password) errors.password = 'Password is required.';
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      // On success the auth guard switches to the protected area automatically.
      await signIn({ email: email.trim(), password });
    } catch (error) {
      if (error instanceof ApiError && error.fields) setFieldErrors(error.fields);
      setFormError(error instanceof Error ? error.message : 'Sign in failed. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <BrandHeader title="Welcome back" subtitle="Sign in to your Media Navigator account." />

      {formError ? <Notice variant="error" message={formError} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        placeholder="you@company.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        placeholder="Your password"
        secureToggle
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
      />

      <View className="-mt-sm mb-lg items-end">
        <TextLink href="/auth/forgot-password" label="Forgot password?" />
      </View>

      <Button title="Sign In" onPress={handleSubmit} loading={submitting} />

      <View className="mt-2xl flex-row flex-wrap items-center justify-center">
        <Text className="text-label font-normal text-neutral-500">Don’t have an account?</Text>
        <TextLink href="/auth/signup" label="Create account" replace />
      </View>
    </Screen>
  );
}
