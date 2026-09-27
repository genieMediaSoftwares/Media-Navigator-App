import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, setUnauthorizedHandler } from '@/lib/api/client';
import { deleteSecureItem, getSecureItem, SecureStorageKey, setSecureItem } from '@/lib/storage/secure-storage';

import { AuthPayload, fetchCurrentUser, loginRequest, logoutRequest, signupRequest, User } from './api';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: User }
  /** A stored session exists but could not be checked (e.g. offline). Nothing is assumed. */
  | { status: 'error'; message: string };

export interface SignOutResult {
  /** False when the server could not be reached to revoke the session. */
  serverRevoked: boolean;
}

interface AuthContextValue {
  state: AuthState;
  signIn(input: { email: string; password: string }): Promise<void>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<void>;
  signOut(): Promise<SignOutResult>;
  /** Re-check the stored session with the server. */
  restoreSession(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const restoreSession = useCallback(async () => {
    setState({ status: 'loading' });
    const token = await getSecureItem(SecureStorageKey.AuthToken);
    if (!token) {
      setState({ status: 'unauthenticated' });
      return;
    }
    try {
      setState({ status: 'authenticated', user: await fetchCurrentUser() });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The API client already cleared the invalid token.
        setState({ status: 'unauthenticated' });
      } else {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Unable to verify your session.' });
      }
    }
  }, []);

  useEffect(() => {
    // Any authenticated request that returns 401 lands the user back on the auth screens.
    setUnauthorizedHandler(() => setState({ status: 'unauthenticated' }));
    void restoreSession();
    return () => setUnauthorizedHandler(null);
  }, [restoreSession]);

  const completeAuth = useCallback(async (payload: AuthPayload) => {
    await setSecureItem(SecureStorageKey.AuthToken, payload.session.token);
    setState({ status: 'authenticated', user: payload.user });
  }, []);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => completeAuth(await loginRequest(input)),
    [completeAuth],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string }) => completeAuth(await signupRequest(input)),
    [completeAuth],
  );

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    let serverRevoked = true;
    try {
      await logoutRequest();
    } catch (error) {
      // A 401 means the session was already invalid on the server, which is the goal.
      serverRevoked = error instanceof ApiError && error.status === 401;
    }
    await deleteSecureItem(SecureStorageKey.AuthToken);
    setState({ status: 'unauthenticated' });
    return { serverRevoked };
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signUp, signOut, restoreSession }),
    [state, signIn, signUp, signOut, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
