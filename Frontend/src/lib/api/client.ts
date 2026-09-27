import { getApiBaseUrl } from '@/config/env';
import { deleteSecureItem, getSecureItem, SecureStorageKey } from '@/lib/storage/secure-storage';

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when no response was received. */
    readonly status: number,
    /** Machine-readable code from the Worker (e.g. INVALID_CREDENTIALS) or a client-side code. */
    readonly code: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; fields?: FieldErrors } };

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialized as the JSON request body. */
  json?: unknown;
  /** Attach the stored session token. A 401 then clears it and notifies the unauthorized handler. */
  auth?: boolean;
}

let unauthorizedHandler: (() => void) | null = null;

/** Registered by the auth provider so an invalid session anywhere signs the user out. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function handleUnauthorized(): Promise<void> {
  await deleteSecureItem(SecureStorageKey.AuthToken);
  unauthorizedHandler?.();
}

// Thin fetch wrapper for the Media Navigator Worker. Failures are always thrown to the
// caller so screens can render a real error state; there is no fallback data.
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { json, auth = false, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (json !== undefined) headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = await getSecureItem(SecureStorageKey.AuthToken);
    if (!token) {
      await handleUnauthorized();
      throw new ApiError('You are not signed in.', 401, 'AUTH_REQUIRED');
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  let url: string;
  try {
    url = `${getApiBaseUrl()}${path}`;
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'API URL is not configured.', 0, 'CONFIG_ERROR');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }

  let envelope: Envelope<T>;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError(`Unexpected response from the server (status ${response.status}).`, response.status, 'INVALID_RESPONSE');
  }

  if (!response.ok || !envelope.success) {
    const error = envelope.success ? null : envelope.error;
    if (auth && response.status === 401) await handleUnauthorized();
    throw new ApiError(
      error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.fields,
    );
  }
  return envelope.data;
}
