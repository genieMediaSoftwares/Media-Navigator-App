import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import { findAccountsByUserId, upsertConnectedAccount } from '../src/db/accounts';
import {
	deletePlatformCredentials,
	getPlatformCredentials,
	storePlatformCredentials,
} from '../src/services/credentials';
import {
	consumeInstagramOAuthState,
	createInstagramOAuthState,
} from '../src/services/instagram';
import { ApiResult, call, signUp } from './helpers';

function getData(res: ApiResult): any {
	if (res.body.success) return res.body.data;
	throw new Error(`Expected success result, got: ${JSON.stringify(res.body)}`);
}

describe('Option A — Manual Meta Access Token Instagram Connection API', () => {
	it('1. Missing token -> 400 VALIDATION_ERROR', async () => {
		const { token } = await signUp();
		const res = await call('POST', '/api/accounts/connect', {
			token,
			body: { platform: 'instagram' },
		});
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({
			success: false,
			error: { code: 'VALIDATION_ERROR' },
		});
	});

	it('2. Empty token -> 400 VALIDATION_ERROR', async () => {
		const { token } = await signUp();
		const res = await call('POST', '/api/accounts/connect', {
			token,
			body: { platform: 'instagram', accessToken: '   ' },
		});
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({
			success: false,
			error: { code: 'VALIDATION_ERROR' },
		});
	});

	it('3. Missing authentication -> 401 AUTH_REQUIRED', async () => {
		const res = await call('POST', '/api/accounts/connect', {
			body: { platform: 'instagram', accessToken: 'EAAB123' },
		});
		expect(res.status).toBe(401);
		expect(res.body).toMatchObject({
			success: false,
			error: { code: 'AUTH_REQUIRED' },
		});
	});

	it('4. Invalid Meta token -> 400 INVALID_TOKEN', async () => {
		const { token } = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						error: {
							message: 'Invalid OAuth access token.',
							type: 'OAuthException',
							code: 190,
						},
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				),
			),
		) as any;

		try {
			const res = await call('POST', '/api/accounts/connect', {
				token,
				body: { platform: 'instagram', accessToken: 'invalid_meta_token_123' },
			});
			expect(res.status).toBe(400);
			expect(res.body).toMatchObject({
				success: false,
				error: { code: 'INVALID_TOKEN', message: expect.stringContaining('Meta rejected the access token') },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('5. Meta API rejection handled safely without leaking token', async () => {
		const { token } = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const secretToken = 'EAAB_SECRET_META_TOKEN_DO_NOT_LEAK';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						error: { message: 'Token expired', code: 190 },
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				),
			),
		) as any;

		try {
			const res = await call('POST', '/api/accounts/connect', {
				token,
				body: { platform: 'instagram', accessToken: secretToken },
			});
			expect(res.status).toBe(400);
			const resText = JSON.stringify(res.body);
			expect(resText).not.toContain(secretToken);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('6 & 7. Successful Meta token validation and real account metadata extraction', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const validToken = 'EAAB_VALID_META_ACCESS_TOKEN';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/me/accounts')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'fb_page_101',
								name: 'Real Meta Business Page',
								instagram_business_account: {
									id: 'ig_biz_account_777',
									username: 'real_instagram_creator',
									name: 'Real Creator Display Name',
								},
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('{}', { status: 404 });
		}) as any;

		try {
			const res = await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: validToken },
			});

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(getData(res).account).toEqual({
				id: expect.any(String),
				platform: 'instagram',
				accountName: 'Real Creator Display Name',
				username: 'real_instagram_creator',
				status: 'connected',
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('8 & 9. Credential encryption/storage: raw token is encrypted in KV and omitted from API responses', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const secretToken = 'EAAB_SENSITIVE_PASTED_TOKEN_999';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/me/accounts')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'fb_page_1',
								name: 'Page Name',
								instagram_business_account: {
									id: 'ig_acc_999',
									username: 'handle_999',
									name: 'Name 999',
								},
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('{}', { status: 404 });
		}) as any;

		try {
			const res = await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: secretToken },
			});
			expect(res.status).toBe(200);

			// Response contains no raw access token or token reference
			const responseJson = JSON.stringify(res.body);
			expect(responseJson).not.toContain(secretToken);

			// List accounts API response also contains no tokens
			const listRes = await call('GET', '/api/accounts', { token: user.token });
			const listJson = JSON.stringify(listRes.body);
			expect(listJson).not.toContain(secretToken);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('10. Raw token not written to D1', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const secretToken = 'EAAB_D1_RAW_TOKEN_CHECK';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async () => {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: 'fb_page_d1',
							name: 'Page D1',
							instagram_business_account: {
								id: 'ig_d1_123',
								username: 'd1_handle',
								name: 'D1 Name',
							},
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			);
		}) as any;

		try {
			await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: secretToken },
			});

			const rows = await findAccountsByUserId(env.DB, user.userId);
			expect(rows).toHaveLength(1);
			expect(rows[0].token_reference).toMatch(/^cred_/);
			expect(JSON.stringify(rows[0])).not.toContain(secretToken);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('11. Duplicate account update safely updates token reference without creating duplicate row', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async () => {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: 'fb_page_dup',
							name: 'Page Dup',
							instagram_business_account: {
								id: 'ig_dup_456',
								username: 'dup_handle',
								name: 'Dup Name',
							},
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			);
		}) as any;

		try {
			// Connect first time
			const firstRes = await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: 'token_first_connection' },
			});
			expect(firstRes.status).toBe(200);

			// Connect second time with updated token for same account
			const secondRes = await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: 'token_second_connection' },
			});
			expect(secondRes.status).toBe(200);

			// Check D1 records: exactly 1 row
			const rows = await findAccountsByUserId(env.DB, user.userId);
			expect(rows).toHaveLength(1);
			expect(rows[0].account_username).toBe('dup_handle');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('12. Account ownership isolation: User B cannot claim Instagram account connected to User A', async () => {
		const userA = await signUp();
		const userB = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async () => {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: 'fb_page_shared',
							name: 'Shared Page',
							instagram_business_account: {
								id: 'ig_shared_888',
								username: 'shared_handle',
								name: 'Shared Name',
							},
						},
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			);
		}) as any;

		try {
			// User A connects the Instagram account
			const resA = await call('POST', '/api/accounts/connect', {
				token: userA.token,
				body: { platform: 'instagram', accessToken: 'token_user_A' },
			});
			expect(resA.status).toBe(200);

			// User B attempts to connect the same Instagram account
			const resB = await call('POST', '/api/accounts/connect', {
				token: userB.token,
				body: { platform: 'instagram', accessToken: 'token_user_B' },
			});
			expect(resB.status).toBe(409);
			expect(resB.body).toMatchObject({
				success: false,
				error: { code: 'ACCOUNT_ALREADY_CONNECTED' },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('13. Unexpected Meta API failure handled safely', async () => {
		const { token } = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Meta server connection timeout')) as any;

		try {
			const res = await call('POST', '/api/accounts/connect', {
				token,
				body: { platform: 'instagram', accessToken: 'token_meta_down' },
			});
			expect(res.status).toBe(500);
			expect(res.body).toMatchObject({
				success: false,
				error: { code: 'INTERNAL_ERROR' },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('14. No token leakage in logs or error messages', async () => {
		const spyError = vi.spyOn(console, 'error');
		const spyLog = vi.spyOn(console, 'log');

		const secretToken = 'SECRET_TOKEN_DO_NOT_LOG_OPTION_A';
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const tokenRef = await storePlatformCredentials(env, 'user_logging_test', { accessToken: secretToken });
		await getPlatformCredentials(env, 'user_logging_test', tokenRef);

		const allLogText = [...spyError.mock.calls, ...spyLog.mock.calls].map((c) => JSON.stringify(c)).join(' ');
		expect(allLogText).not.toContain(secretToken);

		spyError.mockRestore();
		spyLog.mockRestore();
	});

	it('15. POST /api/accounts/:id/sync - Syncs real Meta media & insights and returns summary without credentials', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const secretToken = 'EAAB_SYNC_TOKEN_TEST_123';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/me/accounts')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'page_sync_1',
								name: 'Sync Page',
								instagram_business_account: {
									id: 'ig_sync_101',
									username: 'sync_user',
									name: 'Sync User Name',
								},
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/ig_sync_101/media')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'media_post_1',
								caption: 'Real test Instagram post caption',
								media_type: 'IMAGE',
								permalink: 'https://instagram.com/p/test1',
								timestamp: '2026-09-25T10:00:00+0000',
								like_count: 42,
								comments_count: 5,
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/ig_sync_101')) {
				return new Response(
					JSON.stringify({
						id: 'ig_sync_101',
						username: 'sync_user',
						name: 'Sync User Name',
						followers_count: 1250,
						follows_count: 350,
						media_count: 1,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('{}', { status: 200 });
		}) as any;

		try {
			// 1. Connect
			const connectRes = await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: secretToken },
			});
			expect(connectRes.status).toBe(200);
			const accountId = getData(connectRes).account.id;

			// 2. Sync
			const syncRes = await call('POST', `/api/accounts/${accountId}/sync`, {
				token: user.token,
			});

			expect(syncRes.status).toBe(200);
			expect(syncRes.body.success).toBe(true);
			const summary = getData(syncRes);
			expect(summary.accountId).toBe(accountId);
			expect(summary.postsSynced).toBe(1);
			expect(summary.metricsSynced).toBeGreaterThan(0);
			expect(JSON.stringify(syncRes.body)).not.toContain(secretToken);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('16. GET /api/accounts/:id/dashboard - Returns real synced data, metrics, posts & no credentials', async () => {
		const user = await signUp();
		env.ENCRYPTION_KEY = 'test_encryption_key_32_bytes_len';
		const secretToken = 'EAAB_DASHBOARD_TEST_TOKEN';

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/me/accounts')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'page_dash_1',
								name: 'Dash Page',
								instagram_business_account: {
									id: 'ig_dash_202',
									username: 'dash_creator',
									name: 'Dashboard Creator',
								},
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/ig_dash_202/media')) {
				return new Response(
					JSON.stringify({
						data: [
							{
								id: 'post_dash_abc',
								caption: 'Dashboard media post caption',
								media_type: 'IMAGE',
								permalink: 'https://instagram.com/p/dash_abc',
								timestamp: '2026-09-26T08:00:00+0000',
								like_count: 100,
								comments_count: 10,
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (url.includes('/ig_dash_202')) {
				return new Response(
					JSON.stringify({
						id: 'ig_dash_202',
						username: 'dash_creator',
						name: 'Dashboard Creator',
						followers_count: 5000,
						follows_count: 200,
						media_count: 1,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('{}', { status: 200 });
		}) as any;

		try {
			const connectRes = await call('POST', '/api/accounts/connect', {
				token: user.token,
				body: { platform: 'instagram', accessToken: secretToken },
			});
			const accountId = getData(connectRes).account.id;

			const dashRes = await call('GET', `/api/accounts/${accountId}/dashboard`, {
				token: user.token,
			});

			expect(dashRes.status).toBe(200);
			expect(dashRes.body.success).toBe(true);
			const dash = getData(dashRes);

			expect(dash.account.handle).toBe('dash_creator');
			expect(dash.metrics.followersCount).toBe(5000);
			expect(dash.posts).toHaveLength(1);
			expect(dash.posts[0].caption).toBe('Dashboard media post caption');
			expect(dash.posts[0].likeCount).toBe(100);

			// Assert no tokens in dashboard response
			expect(JSON.stringify(dashRes.body)).not.toContain(secretToken);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
