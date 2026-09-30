import { redactSecrets } from '../../lib/redact';
import { ProviderApiError, ProviderAuthError } from './types';

const TIMEOUT_MS = 20_000;

export function metricNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	// YouTube returns counts as decimal strings.
	if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
	return null;
}

/**
 * JSON request to a platform API. 401 (and 403 when `authStatuses` says so) become ProviderAuthError;
 * other failures become ProviderApiError with the platform's message, redacted of any token.
 */
export async function requestJson<T>(
	url: string,
	init: RequestInit & { fetchImpl?: typeof fetch; authStatuses?: number[] } = {},
): Promise<T> {
	const { fetchImpl = fetch, authStatuses = [401], ...rest } = init;
	let response: Response;
	try {
		response = await fetchImpl(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
	} catch (error) {
		throw new ProviderApiError(redactSecrets(error instanceof Error ? error.message : 'Network error'), 502);
	}
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	if (!response.ok) {
		const message = redactSecrets(errorMessage(body) ?? `Request failed with status ${response.status}`);
		if (authStatuses.includes(response.status) || isMetaTokenError(body)) throw new ProviderAuthError(message);
		throw new ProviderApiError(message, response.status);
	}
	return body as T;
}

function errorMessage(body: unknown): string | null {
	const b = body as { error?: { message?: string } | string; message?: string; error_description?: string } | null;
	if (!b) return null;
	if (typeof b.error === 'object' && b.error?.message) return b.error.message;
	if (typeof b.error_description === 'string') return b.error_description;
	if (typeof b.message === 'string') return b.message;
	if (typeof b.error === 'string') return b.error;
	return null;
}

/** Meta error code 190 = invalid/expired access token. */
function isMetaTokenError(body: unknown): boolean {
	return (body as { error?: { code?: number } } | null)?.error?.code === 190;
}
