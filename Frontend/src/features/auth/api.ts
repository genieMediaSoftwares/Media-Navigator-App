import { apiRequest } from '@/lib/api/client';
import { User } from '@/types/api';

export type { User };

export interface AuthPayload {
  user: User;
  session: {
    token: string;
    expiresAt: string;
  };
}

export function signupRequest(input: { email: string; password: string; displayName: string }): Promise<AuthPayload> {
  return apiRequest<AuthPayload>('/api/auth/signup', { method: 'POST', json: input });
}

export function loginRequest(input: { email: string; password: string }): Promise<AuthPayload> {
  return apiRequest<AuthPayload>('/api/auth/login', { method: 'POST', json: input });
}

export function logoutRequest(): Promise<null> {
  return apiRequest<null>('/api/auth/logout', { method: 'POST', auth: true });
}

export async function fetchCurrentUser(): Promise<User> {
  const { user } = await apiRequest<{ user: User }>('/api/auth/me', { auth: true });
  return user;
}

export function forgotPasswordRequest(input: { email: string }): Promise<unknown> {
  return apiRequest<unknown>('/api/auth/forgot-password', { method: 'POST', json: input });
}
