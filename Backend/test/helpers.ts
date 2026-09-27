import { exports } from 'cloudflare:workers';

const BASE_URL = 'https://api.test';

export interface ApiResult<T = any> {
	status: number;
	headers: Headers;
	body: { success: true; data: T } | { success: false; error: { code: string; message: string; fields?: Record<string, string> } };
}

export async function call<T = any>(
	method: string,
	path: string,
	options: { body?: unknown; token?: string; headers?: Record<string, string>; redirect?: 'follow' | 'error' | 'manual' } = {},
): Promise<ApiResult<T>> {
	const headers = new Headers(options.headers);
	if (options.body !== undefined) headers.set('Content-Type', 'application/json');
	if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
	const response = await exports.default.fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		redirect: options.redirect ?? 'manual',
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	let body: any = null;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	return { status: response.status, headers: response.headers, body };
}

/** A unique address per call so tests never collide. These records exist only in the test runtime. */
export function uniqueEmail(): string {
	return `test-${crypto.randomUUID()}@example.com`;
}

export const VALID_PASSWORD = 'correct horse battery';

export async function signUp(overrides: { email?: string; password?: string; displayName?: string } = {}) {
	const credentials = {
		email: overrides.email ?? uniqueEmail(),
		password: overrides.password ?? VALID_PASSWORD,
		displayName: overrides.displayName ?? 'Test User',
	};
	const result = await call('POST', '/api/auth/signup', { body: credentials });
	if (!result.body.success) throw new Error(`Signup failed in test setup: ${JSON.stringify(result.body)}`);
	return { ...credentials, token: result.body.data.session.token as string, userId: result.body.data.user.id as string };
}
