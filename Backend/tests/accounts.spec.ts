import { afterEach, describe, expect, it, vi } from 'vitest';

import { overrideConfig } from '../src/config/env';
import { findAccountsByUserId } from '../src/db/accounts';
import { AccountInsight, ContentItem, OAuthState, PlatformCredential, SyncRun } from '../src/models';
import { deletePlatformCredentials, getPlatformCredentials, storePlatformCredentials } from '../src/services/credentials';
import { consumeOAuthState, createOAuthState, resolveReturnUrl } from '../src/services/oauth';
import { call, getData, json, signUp } from './helpers';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

/** Meta Graph API stand-in for one Instagram business account. Fixtures exist only inside tests. */
function mockMeta(options: { igId: string; username?: string; name?: string; followers?: number; media?: unknown[] }) {
	const username = options.username ?? `${options.igId}_user`;
	globalThis.fetch = vi.fn().mockImplementation(async (input: string) => {
		const url = String(input);
		if (url.includes('/me/accounts')) {
			return json({ data: [{ id: `page_${options.igId}`, name: 'Page', instagram_business_account: { id: options.igId, username, name: options.name ?? 'Creator' } }] });
		}
		if (url.includes(`/${options.igId}/media`)) return json({ data: options.media ?? [] });
		if (url.includes(`/${options.igId}/insights`)) return json({ data: [] });
		if (url.includes(`/${options.igId}`)) {
			return json({ id: options.igId, username, name: options.name ?? 'Creator', followers_count: options.followers ?? 1000, follows_count: 50, media_count: (options.media ?? []).length });
		}
		return json({}, 404);
	}) as any;
}

async function connectInstagram(token: string, accessToken: string) {
	return call('POST', '/api/accounts/connect', { token, body: { platform: 'instagram', accessToken } });
}

describe('Manual Meta access token Instagram connection', () => {
	it('1. Missing token -> 400 VALIDATION_ERROR', async () => {
		const { token } = await signUp();
		const res = await call('POST', '/api/accounts/connect', { token, body: { platform: 'instagram' } });
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
	});

	it('2. Empty token -> 400 VALIDATION_ERROR', async () => {
		const { token } = await signUp();
		const res = await connectInstagram(token, '   ');
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
	});

	it('3. Missing authentication -> 401 AUTH_REQUIRED', async () => {
		const res = await call('POST', '/api/accounts/connect', { body: { platform: 'instagram', accessToken: 'EAAB123' } });
		expect(res.status).toBe(401);
		expect(res.body).toMatchObject({ success: false, error: { code: 'AUTH_REQUIRED' } });
	});

	it('4. Invalid Meta token -> 400 INVALID_TOKEN', async () => {
		const { token } = await signUp();
		globalThis.fetch = vi.fn().mockImplementation(async () => json({ error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } }, 400)) as any;
		const res = await connectInstagram(token, 'invalid_meta_token_123');
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ success: false, error: { code: 'INVALID_TOKEN', message: expect.stringContaining('Meta rejected the access token') } });
	});

	it('5. Meta API rejection handled safely without leaking token', async () => {
		const { token } = await signUp();
		const secretToken = 'EAAB_SECRET_META_TOKEN_DO_NOT_LEAK';
		globalThis.fetch = vi.fn().mockImplementation(async () => json({ error: { message: 'Token expired', code: 190 } }, 400)) as any;
		const res = await connectInstagram(token, secretToken);
		expect(res.status).toBe(400);
		expect(JSON.stringify(res.body)).not.toContain(secretToken);
	});

	it('6 & 7. Successful Meta token validation and real account metadata extraction', async () => {
		const user = await signUp();
		mockMeta({ igId: 'ig_biz_account_777', username: 'real_instagram_creator', name: 'Real Creator Display Name' });
		const res = await connectInstagram(user.token, 'EAAB_VALID_META_ACCESS_TOKEN');
		expect(res.status).toBe(200);
		expect(getData(res).account).toEqual({
			id: expect.any(String),
			platform: 'instagram',
			accountName: 'Real Creator Display Name',
			username: 'real_instagram_creator',
			status: 'connected',
		});
	});

	it('8 & 9. The raw token is stored encrypted and omitted from API responses', async () => {
		const user = await signUp();
		const secretToken = 'EAAB_SENSITIVE_PASTED_TOKEN_999';
		mockMeta({ igId: 'ig_acc_999' });
		const res = await connectInstagram(user.token, secretToken);
		expect(res.status).toBe(200);
		expect(JSON.stringify(res.body)).not.toContain(secretToken);

		const list = await call('GET', '/api/accounts', { token: user.token });
		expect(JSON.stringify(list.body)).not.toContain(secretToken);
		expect(JSON.stringify(list.body)).not.toContain('cred_');

		const stored = await PlatformCredential.find({ userId: user.userId }).lean();
		expect(stored).toHaveLength(1);
		expect(JSON.stringify(stored)).not.toContain(secretToken);
		expect(stored[0].ciphertext.length).toBeGreaterThan(secretToken.length);
		expect((await getPlatformCredentials(user.userId, stored[0]._id))?.accessToken).toBe(secretToken);
	});

	it('10. The raw token is not written to the connected account document', async () => {
		const user = await signUp();
		const secretToken = 'EAAB_MONGO_RAW_TOKEN_CHECK';
		mockMeta({ igId: 'ig_mongo_123' });
		await connectInstagram(user.token, secretToken);
		const rows = await findAccountsByUserId(user.userId);
		expect(rows).toHaveLength(1);
		expect(rows[0].token_reference).toMatch(/^cred_/);
		expect(JSON.stringify(rows[0])).not.toContain(secretToken);
	});

	it('11. Reconnecting updates the same account and deletes the replaced credential', async () => {
		const user = await signUp();
		mockMeta({ igId: 'ig_dup_456', username: 'dup_handle' });
		const first = await connectInstagram(user.token, 'token_first_connection');
		const second = await connectInstagram(user.token, 'token_second_connection');
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(getData(second).account.id).toBe(getData(first).account.id);

		const rows = await findAccountsByUserId(user.userId);
		expect(rows).toHaveLength(1);
		expect(rows[0].account_username).toBe('dup_handle');
		const credentials = await PlatformCredential.find({ userId: user.userId }).lean();
		expect(credentials).toHaveLength(1);
		expect((await getPlatformCredentials(user.userId, rows[0].token_reference))?.accessToken).toBe('token_second_connection');
	});

	it('12. Account ownership isolation: User B cannot claim an Instagram account connected to User A', async () => {
		const userA = await signUp();
		const userB = await signUp();
		mockMeta({ igId: 'ig_shared_888' });
		expect((await connectInstagram(userA.token, 'token_user_A')).status).toBe(200);
		const resB = await connectInstagram(userB.token, 'token_user_B');
		expect(resB.status).toBe(409);
		expect(resB.body).toMatchObject({ success: false, error: { code: 'ACCOUNT_ALREADY_CONNECTED' } });
		expect(await PlatformCredential.countDocuments({ userId: userB.userId })).toBe(0);
	});

	it('13. Unexpected Meta API failure handled safely', async () => {
		const { token } = await signUp();
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Meta server connection timeout')) as any;
		const res = await connectInstagram(token, 'token_meta_down');
		expect(res.status).toBe(500);
		expect(res.body).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
	});

	it('14. No token leakage in logs', async () => {
		const spyError = vi.spyOn(console, 'error');
		const spyLog = vi.spyOn(console, 'log');
		const secretToken = 'SECRET_TOKEN_DO_NOT_LOG_OPTION_A';
		const tokenRef = await storePlatformCredentials('user_logging_test', { accessToken: secretToken });
		await getPlatformCredentials('user_logging_test', tokenRef);
		await getPlatformCredentials('someone_else', tokenRef);
		const allLogText = [...spyError.mock.calls, ...spyLog.mock.calls].map((c) => JSON.stringify(c)).join(' ');
		expect(allLogText).not.toContain(secretToken);
		expect(await getPlatformCredentials('someone_else', tokenRef)).toBeNull();
		await deletePlatformCredentials('user_logging_test', tokenRef);
		spyError.mockRestore();
		spyLog.mockRestore();
	});

	it('15. POST /api/accounts/:id/sync syncs media & insights and returns a summary without credentials', async () => {
		const user = await signUp();
		const secretToken = 'EAAB_SYNC_TOKEN_TEST_123';
		mockMeta({
			igId: 'ig_sync_101',
			followers: 1250,
			media: [
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
		});
		const accountId = getData(await connectInstagram(user.token, secretToken)).account.id;
		const syncRes = await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		expect(syncRes.status).toBe(200);
		const summary = getData(syncRes);
		expect(summary.accountId).toBe(accountId);
		expect(summary.postsSynced).toBe(1);
		expect(summary.metricsSynced).toBeGreaterThan(0);
		expect(JSON.stringify(syncRes.body)).not.toContain(secretToken);

		// Re-syncing is idempotent.
		await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		const items = await ContentItem.find({ connectedAccountId: accountId }).lean();
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			platform: 'instagram',
			format: 'POST',
			timestampRaw: '2026-09-25T10:00:00+0000',
			interactions: 47,
			metrics: { likes: 42, comments: 5, views: null, reach: null, saves: null, shares: null, totalInteractions: null },
		});
		expect(items[0].publishedAt?.toISOString()).toBe('2026-09-25T10:00:00.000Z');
	});

	it('16. GET /api/accounts/:id/dashboard returns synced data, metrics, posts and no credentials', async () => {
		const user = await signUp();
		const secretToken = 'EAAB_DASHBOARD_TEST_TOKEN';
		mockMeta({
			igId: 'ig_dash_202',
			username: 'dash_creator',
			followers: 5000,
			media: [
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
		});
		const accountId = getData(await connectInstagram(user.token, secretToken)).account.id;
		const dashRes = await call('GET', `/api/accounts/${accountId}/dashboard`, { token: user.token });
		expect(dashRes.status).toBe(200);
		const dash = getData(dashRes);
		expect(dash.account.handle).toBe('dash_creator');
		expect(dash.metrics.followersCount).toBe(5000);
		expect(dash.posts).toHaveLength(1);
		expect(dash.posts[0].caption).toBe('Dashboard media post caption');
		expect(dash.posts[0].likeCount).toBe(100);
		expect(JSON.stringify(dashRes.body)).not.toContain(secretToken);

		const other = await signUp();
		expect((await call('GET', `/api/accounts/${accountId}/dashboard`, { token: other.token })).status).toBe(404);
		expect((await call('POST', `/api/accounts/${accountId}/sync`, { token: other.token })).status).toBe(404);
	});

	it('17. A revoked Meta token during sync marks the account for reauthorization', async () => {
		const user = await signUp();
		mockMeta({ igId: 'ig_revoked_1' });
		const accountId = getData(await connectInstagram(user.token, 'EAAB_WILL_BE_REVOKED')).account.id;
		globalThis.fetch = vi.fn().mockImplementation(async () => json({ error: { message: 'Session has expired', code: 190 } }, 400)) as any;
		const res = await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
		const list = getData(await call('GET', '/api/accounts', { token: user.token }));
		expect(list.accounts[0].status).toBe('reauthorization_required');
	});

	it('18. Disconnect deletes the credential, the account and all synced data', async () => {
		const user = await signUp();
		mockMeta({
			igId: 'ig_disconnect_1',
			media: [{ id: 'm1', media_type: 'IMAGE', timestamp: '2026-09-25T10:00:00+0000', like_count: 1, comments_count: 1 }],
		});
		const accountId = getData(await connectInstagram(user.token, 'EAAB_DISCONNECT')).account.id;
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(1);

		const other = await signUp();
		expect((await call('DELETE', `/api/accounts/${accountId}`, { token: other.token })).status).toBe(404);

		const res = await call('DELETE', `/api/accounts/${accountId}`, { token: user.token });
		expect(res.status).toBe(200);
		expect(await PlatformCredential.countDocuments({ userId: user.userId })).toBe(0);
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(0);
		expect(await AccountInsight.countDocuments({ connectedAccountId: accountId })).toBe(0);
		expect(await SyncRun.countDocuments({ connectedAccountId: accountId })).toBe(0);
		expect(getData(await call('GET', '/api/accounts', { token: user.token })).accounts).toEqual([]);
	});
});

describe('OAuth state and callback safety', () => {
	it('states are single-use, platform-bound, expire, and only their hash is stored', async () => {
		const user = await signUp();
		const state = await createOAuthState(user.userId, 'instagram', 'medianavigator://oauth/callback');
		const stored = await OAuthState.find({ userId: user.userId }).lean();
		expect(stored).toHaveLength(1);
		expect(stored[0]._id).not.toBe(state);

		expect(await consumeOAuthState(state, 'facebook')).toBeNull();
		const fresh = await createOAuthState(user.userId, 'instagram', 'medianavigator://oauth/callback');
		expect(await consumeOAuthState(fresh, 'instagram')).toMatchObject({ userId: user.userId });
		expect(await consumeOAuthState(fresh, 'instagram')).toBeNull();

		const expired = await createOAuthState(user.userId, 'instagram', 'medianavigator://oauth/callback', { now: Date.now() - 11 * 60 * 1000 });
		expect(await consumeOAuthState(expired, 'instagram')).toBeNull();
	});

	it('only app deep links are accepted as return URLs (no open redirect)', () => {
		expect(resolveReturnUrl(null)).toBe('medianavigator://oauth/callback');
		expect(resolveReturnUrl('exp://192.168.0.9:8081/--/oauth/callback')).toBe('exp://192.168.0.9:8081/--/oauth/callback');
		expect(() => resolveReturnUrl('https://evil.example/steal')).toThrow();
		expect(() => resolveReturnUrl('javascript:alert(1)')).toThrow();
	});

	it('the callback rejects an unknown state and redirects back to the app with an error', async () => {
		const res = await call('GET', '/api/accounts/callback/instagram?code=abc&state=forged');
		expect(res.status).toBe(302);
		const location = res.headers.get('Location') ?? '';
		expect(location.startsWith('medianavigator://oauth/callback?')).toBe(true);
		expect(location).toContain('status=error');
	});

	it('reports OAuth as not configured instead of building a broken URL', async () => {
		const { token } = await signUp();
		const res = await call('GET', '/api/accounts/connect/instagram', { token });
		expect(res.status).toBe(503);
		expect(res.body).toMatchObject({ error: { code: 'CONFIG_ERROR' } });
		expect(JSON.stringify(res.body)).not.toContain('META_APP');
	});

	it('the Instagram OAuth flow exchanges the code, connects the account and redirects to the app', async () => {
		const restore = overrideConfig({ META_APP_ID: 'app_1', META_APP_SECRET: 'app_secret_value', META_REDIRECT_URI: 'https://api.example/api/accounts/callback/instagram' });
		try {
			const user = await signUp();
			const start = getData(await call('GET', '/api/accounts/connect/instagram?returnUrl=exp%3A%2F%2F10.0.0.5%3A8081%2F--%2Foauth%2Fcallback', { token: user.token }));
			const authUrl = new URL(start.authorizationUrl);
			expect(authUrl.origin).toBe('https://www.facebook.com');
			expect(authUrl.searchParams.get('client_id')).toBe('app_1');
			expect(authUrl.toString()).not.toContain('app_secret_value');
			const state = authUrl.searchParams.get('state') as string;

			globalThis.fetch = vi.fn().mockImplementation(async (input: string) => {
				const url = String(input);
				if (url.includes('/oauth/access_token')) return json({ access_token: url.includes('fb_exchange_token') ? 'LONG_LIVED' : 'SHORT_LIVED', expires_in: 5_000_000 });
				if (url.includes('/me/accounts')) return json({ data: [{ id: 'p', name: 'P', instagram_business_account: { id: 'ig_oauth_1', username: 'oauth_creator' } }] });
				if (url.includes('/ig_oauth_1/media')) return json({ data: [] });
				if (url.includes('/ig_oauth_1')) return json({ id: 'ig_oauth_1', username: 'oauth_creator', followers_count: 10 });
				return json({});
			}) as any;

			const callback = await call('GET', `/api/accounts/callback/instagram?code=auth_code&state=${encodeURIComponent(state)}`);
			expect(callback.status).toBe(302);
			expect(callback.headers.get('Location')).toMatch(/^exp:\/\/10\.0\.0\.5:8081\/--\/oauth\/callback\?status=success&platform=instagram&accountId=/);
			const rows = await findAccountsByUserId(user.userId);
			expect(rows).toHaveLength(1);
			expect((await getPlatformCredentials(user.userId, rows[0].token_reference))?.accessToken).toBe('LONG_LIVED');

			// The state cannot be replayed.
			const replay = await call('GET', `/api/accounts/callback/instagram?code=auth_code&state=${encodeURIComponent(state)}`);
			expect(replay.headers.get('Location')).toContain('status=error');
		} finally {
			restore();
		}
	});
});
