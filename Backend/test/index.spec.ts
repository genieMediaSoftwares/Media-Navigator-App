import { describe, it, expect } from 'vitest';
import { call } from './helpers';

describe('media-navigator-api', () => {
	it('GET /health reports ok', async () => {
		const result = await call('GET', '/health');
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ success: true, data: { status: 'ok' } });
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

	it('adds CORS headers only for allowed origins', async () => {
		const allowed = await call('GET', '/health', { headers: { Origin: 'https://allowed.example' } });
		expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');

		const other = await call('GET', '/health', { headers: { Origin: 'https://evil.example' } });
		expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});
});
