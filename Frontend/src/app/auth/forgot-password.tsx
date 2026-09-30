import { useState } from 'react';
import { View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { TextLink } from '@/components/ui/TextLink';
import { forgotPasswordRequest } from '@/features/auth/api';
import { validateEmail } from '@/features/auth/validation';
import { ApiError } from '@/lib/api/client';

type Result = { variant: 'error' | 'warning' | 'success'; title: string; message: string };

// The server endpoint exists but returns 501 PASSWORD_RESET_NOT_CONFIGURED until an email
// provider is set up. This screen shows the server's real answer and never claims an email was sent.
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const error = validateEmail(email);
    setEmailError(error);
    setResult(null);
    if (error) return;

    setSubmitting(true);
    try {
      await forgotPasswordRequest({ email: email.trim() });
      setResult({
        variant: 'success',
        title: 'Request received',
        message: 'If an account exists for this email, password reset instructions have been sent.',
      });
    } catch (requestError) {
      const notConfigured = requestError instanceof ApiError && requestError.status === 501;
      setResult({
        variant: notConfigured ? 'warning' : 'error',
        title: notConfigured ? 'Password reset isn’t available yet' : 'Request failed',
        message: requestError instanceof Error ? requestError.message : 'Password reset failed. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <BrandHeader title="Reset your password" subtitle="Enter the email address you use to sign in." />

      {result ? (
        <Notice variant={result.variant} title={result.title} message={result.message} />
      ) : (
        <Notice
          variant="info"
          title="Not available yet"
          message="Password reset emails can’t be sent yet because email delivery hasn’t been set up for Media Navigator."
        />
      )}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        placeholder="you@company.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
      />

      <Button title="Send reset link" onPress={handleSubmit} loading={submitting} />

      <View className="mt-2xl items-center">
        <TextLink href="/auth/login" label="Back to sign in" />
      </View>
    </Screen>
  );
}
