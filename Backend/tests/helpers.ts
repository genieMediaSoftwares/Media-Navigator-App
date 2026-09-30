import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app';

let app: Express | null = null;

export function testApp(): Express {
	app ??= createApp();
	return app;
}

export interface ApiResult<T = any> {
	status: number;
	headers: { get(name: string): string | null };
	body: { success: true; data: T } | { success: false; error: { code: string; message: string; fields?: Record<string, string> } } | any;
}

export async function call<T = any>(
	method: string,
	path: string,
	options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
	const agent = request(testApp());
	let req = (agent as any)[method.toLowerCase()](path).redirects(0) as request.Test;
	for (const [name, value] of Object.entries(options.headers ?? {})) req = req.set(name, value);
	if (options.token) req = req.set('Authorization', `Bearer ${options.token}`);
	if (options.body !== undefined) req = req.set('Content-Type', 'application/json').send(JSON.stringify(options.body));
	const res = await req;
	const text = res.text ?? '';
	let body: any = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = null;
	}
	return {
		status: res.status,
		headers: { get: (name: string) => (res.headers[name.toLowerCase()] as string | undefined) ?? null },
		body,
	};
}

/** A unique address per call so tests never collide. These records exist only in the test database. */
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
	if (!result.body?.success) throw new Error(`Signup failed in test setup: ${JSON.stringify(result.body)}`);
	return { ...credentials, token: result.body.data.session.token as string, userId: result.body.data.user.id as string };
}

export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export function getData(res: ApiResult): any {
	if (res.body?.success) return res.body.data;
	throw new Error(`Expected success result, got: ${JSON.stringify(res.body)}`);
}
