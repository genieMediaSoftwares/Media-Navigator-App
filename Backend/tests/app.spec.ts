import { describe, expect, it } from 'vitest';

import { call } from './helpers';

describe('media-navigator-api', () => {
	it('GET /health reports ok with a live database round trip', async () => {
		const result = await call('GET', '/health');
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ success: true, data: { status: 'ok', database: 'connected' } });
		expect(JSON.stringify(result.body)).not.toMatch(/mongodb|127\.0\.0\.1|key/i);
	});

	it('returns a JSON 404 for unknown routes', async () => {
		const result = await call('GET', '/does-not-exist');
		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
	});

	it('returns 405 with Allow for a known path and wrong method', async () => {
		const result = await call('GET', '/api/auth/login');
		expect(result.status).toBe(405);
		expect(result.headers.get('Allow')).toBe('POST');
	});

	it('adds CORS headers only for allowed origins, never with credentials', async () => {
		const allowed = await call('GET', '/health', { headers: { Origin: 'https://allowed.example' } });
		expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
		expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBeNull();

		const other = await call('GET', '/health', { headers: { Origin: 'https://evil.example' } });
		expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();

		const preflight = await call('OPTIONS', '/api/accounts', {
			headers: { Origin: 'https://allowed.example', 'Access-Control-Request-Method': 'DELETE' },
		});
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
	});

	it('allows the local Expo web dev server (localhost / 127.0.0.1, any port) but not look-alike origins', async () => {
		for (const origin of ['http://localhost:8081', 'http://127.0.0.1:19006', 'http://localhost']) {
			const preflight = await call('OPTIONS', '/api/auth/login', {
				headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
			});
			expect(preflight.status).toBe(204);
			expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin);
			expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBeNull();
		}
		for (const origin of ['http://localhost.evil.example', 'https://localhost.evil.example:8081', 'http://evil.example?localhost', 'http://127.0.0.1.evil.example']) {
			const result = await call('GET', '/health', { headers: { Origin: origin } });
			expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
		}
	});

	it('sets security headers and never caches API responses', async () => {
		const result = await call('GET', '/health');
		expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(result.headers.get('X-Powered-By')).toBeNull();
		expect(result.headers.get('Cache-Control')).toBe('no-store');
	});

	it('maps malformed and oversized JSON bodies to JSON errors', async () => {
		const malformed = await call('POST', '/api/auth/login', { headers: { 'Content-Type': 'application/json' }, body: undefined });
		expect([400, 415]).toContain(malformed.status);

		const huge = await call('POST', '/api/auth/login', { body: { email: 'x@example.com', password: 'x'.repeat(20_000) } });
		expect(huge.status).toBe(413);
		expect(huge.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });

		const array = await call('POST', '/api/auth/login', { body: [1, 2] });
		expect(array.status).toBe(400);
		expect(array.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
	});
});
