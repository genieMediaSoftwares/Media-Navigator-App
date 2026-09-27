import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { call, signUp } from './helpers';

const PLANNED_GET_ENDPOINTS = [
	'/api/planner/insights',
	'/api/notifications',
];

describe('planned feature endpoints', () => {
	it.each(['/api/overview', ...PLANNED_GET_ENDPOINTS])('GET %s requires authentication', async (path) => {
		const result = await call('GET', path);
		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({ success: false, error: { code: 'AUTH_REQUIRED' } });
	});

	it.each(PLANNED_GET_ENDPOINTS)('GET %s reports 501 FEATURE_NOT_AVAILABLE and returns no data', async (path) => {
		const { token } = await signUp();
		const result = await call('GET', path, { token });
		expect(result.status).toBe(501);
		expect(result.body).toMatchObject({ success: false, error: { code: 'FEATURE_NOT_AVAILABLE' } });
		expect(result.body).not.toHaveProperty('data');
	});

	it('GET /api/overview returns 501 when user has no connected accounts', async () => {
		const { token } = await signUp();
		const result = await call('GET', '/api/overview', { token });
		expect(result.status).toBe(501);
		expect(result.body).toMatchObject({ success: false, error: { code: 'FEATURE_NOT_AVAILABLE' } });
	});

	it('GET /api/overview returns real channels and insights when Instagram account is connected', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/me/accounts')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'page_overview_1',
								name: 'Overview Page',
								instagram_business_account: {
									id: 'ig_overview_303',
									username: 'overview_creator',
									name: 'Overview Creator',
								},
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/ig_overview_303/media')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'post_overview_1',
								caption: 'Overview post caption',
								media_type: 'IMAGE',
								permalink: 'https://instagram.com/p/ov1',
								timestamp: '2026-09-26T09:00:00+0000',
								like_count: 50,
								comments_count: 5,
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/ig_overview_303')) {
				return new Response(
					JSON.stringify({
						id: 'ig_overview_303',
						username: 'overview_creator',
						name: 'Overview Creator',
						followers_count: 3200,
						follows_count: 150,
						media_count: 1,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('{}', { status: 200 });
		}) as any;

		try {
			// Connect account
			await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: 'EAAB_OVERVIEW_TOKEN' },
			});

			// Call GET /api/overview
			const res = await call('GET', '/api/overview', { token: user.token });
			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);

			const data = (res.body as any).data;
			expect(data.accounts).toHaveLength(1);
			expect(data.channels).toHaveLength(1);
			expect(data.channels[0].handle).toBe('overview_creator');
			expect(data.channels[0].followers).toBe(3200);
			expect(data.insights.length).toBeGreaterThan(0);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('POST /api/accounts/connect validates the platform and reports 501 for unbuilt platforms', async () => {
		const { token } = await signUp();

		const unsupported = await call('POST', '/api/accounts/connect', { token, body: { platform: 'myspace' } });
		expect(unsupported.status).toBe(400);
		expect(unsupported.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

		const youtube = await call('POST', '/api/accounts/connect', { token, body: { platform: 'youtube' } });
		expect(youtube.status).toBe(501);
		expect(youtube.body).toMatchObject({ error: { code: 'FEATURE_NOT_AVAILABLE', message: expect.stringContaining('YouTube') } });

		const anonymous = await call('POST', '/api/accounts/connect', { body: { platform: 'youtube' } });
		expect(anonymous.status).toBe(401);
	});
});
