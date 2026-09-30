import { afterEach, describe, expect, it, vi } from 'vitest';

import { Notification } from '../src/models';
import { call, getData, json, signUp } from './helpers';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

function mockInstagram(igId: string, options: { followers?: number; media?: unknown[]; failProfileWith?: number } = {}) {
	globalThis.fetch = vi.fn().mockImplementation(async (input: string) => {
		const url = String(input);
		if (url.includes('/me/accounts')) return json({ data: [{ id: 'page', name: 'Page', instagram_business_account: { id: igId, username: `${igId}_user`, name: 'Creator' } }] });
		if (options.failProfileWith) return json({ error: { message: 'Expired', code: 190 } }, options.failProfileWith);
		if (url.includes(`/${igId}/media`)) return json({ data: options.media ?? [] });
		if (url.includes(`/${igId}/insights`)) return json({ data: [] });
		if (url.includes(`/${igId}`)) return json({ id: igId, username: `${igId}_user`, name: 'Creator', followers_count: options.followers ?? 3200, follows_count: 150, media_count: 1 });
		return json({});
	}) as any;
}

const ONE_POST = [
	{ id: 'post_overview_1', caption: 'Overview post caption', media_type: 'IMAGE', permalink: 'https://instagram.com/p/ov1', timestamp: '2026-09-26T09:00:00+0000', like_count: 50, comments_count: 5 },
];

describe('overview, planner and notifications', () => {
	it.each(['/api/overview', '/api/planner/insights', '/api/notifications'])('GET %s requires authentication', async (path) => {
		const result = await call('GET', path);
		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({ success: false, error: { code: 'AUTH_REQUIRED' } });
	});

	it('GET /api/overview and /api/planner/insights report 501 when the user has no connected accounts', async () => {
		const { token } = await signUp();
		for (const path of ['/api/overview', '/api/planner/insights']) {
			const result = await call('GET', path, { token });
			expect(result.status).toBe(501);
			expect(result.body).toMatchObject({ success: false, error: { code: 'FEATURE_NOT_AVAILABLE' } });
			expect(result.body).not.toHaveProperty('data');
		}
	});

	it('GET /api/notifications returns an empty list (not filler) for a new user', async () => {
		const { token } = await signUp();
		const result = await call('GET', '/api/notifications', { token });
		expect(result.status).toBe(200);
		expect(result.body.data).toEqual({ notifications: [], unreadCount: 0 });
	});

	it('GET /api/overview returns real channels and insights with the Instagram-only ids and labels', async () => {
		const user = await signUp();
		mockInstagram('ig_overview_303', { media: ONE_POST });
		await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'EAAB_OVERVIEW_TOKEN' } });

		const res = await call('GET', '/api/overview', { token: user.token });
		expect(res.status).toBe(200);
		const data = getData(res);
		expect(data.accounts).toHaveLength(1);
		expect(data.heroSignal).toBeNull();
		expect(data.channels).toEqual([
			{ accountId: expect.any(String), platform: 'instagram', handle: 'ig_overview_303_user', followers: 3200, followersChangePercent: null, engagementRate: 1.72 },
		]);
		expect(data.insights.map((i: any) => [i.id, i.label, i.value, i.period])).toEqual([
			['ins_followers', 'Instagram Followers', 3200, 'Total Followers'],
			['ins_posts', 'Instagram Posts', 1, 'Total Synced Media'],
			['ins_engagement', 'Avg Engagement Rate', 1.72, 'Latest 50 posts'],
		]);
	});

	it('POST /api/accounts/connect validates the platform and reports unconfigured OAuth truthfully', async () => {
		const { token } = await signUp();
		const unsupported = await call('POST', '/api/accounts/connect', { token, body: { platform: 'myspace' } });
		expect(unsupported.status).toBe(400);
		expect(unsupported.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

		for (const platform of ['youtube', 'linkedin', 'facebook']) {
			const res = await call('POST', '/api/accounts/connect', { token, body: { platform } });
			expect(res.status).toBe(503);
			expect(res.body).toMatchObject({ error: { code: 'CONFIG_ERROR', message: expect.stringContaining("isn't configured") } });
		}

		const anonymous = await call('POST', '/api/accounts/connect', { body: { platform: 'youtube' } });
		expect(anonymous.status).toBe(401);
	});

	it('records notifications for real events only, and marks them read', async () => {
		const user = await signUp();
		mockInstagram('ig_notify_1', { media: ONE_POST });
		const accountId = getData(await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'EAAB_N' } })).account.id;

		let list = getData(await call('GET', '/api/notifications', { token: user.token }));
		expect(list.notifications.map((n: any) => n.title).sort()).toEqual(['Instagram connected', 'Instagram sync completed']);
		expect(list.unreadCount).toBe(2);
		expect(JSON.stringify(list)).not.toMatch(/EAAB_N|cred_|dedupe/);

		// A second sync replaces the rolling "sync completed" entry instead of adding another.
		await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		list = getData(await call('GET', '/api/notifications', { token: user.token }));
		expect(list.notifications).toHaveLength(2);

		// An expired token produces a "Reconnect" notification.
		mockInstagram('ig_notify_1', { failProfileWith: 400 });
		await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		list = getData(await call('GET', '/api/notifications', { token: user.token }));
		expect(list.notifications[0]).toMatchObject({ kind: 'account', title: 'Reconnect Instagram', readAt: null });

		const read = await call('POST', '/api/notifications/read', { token: user.token, body: {} });
		expect(read.body.data.updated).toBe(3);
		expect(getData(await call('GET', '/api/notifications', { token: user.token })).unreadCount).toBe(0);

		const other = await signUp();
		expect(getData(await call('GET', '/api/notifications', { token: other.token })).notifications).toEqual([]);
	});

	it('respects notification preferences', async () => {
		const user = await signUp();
		const prefs = await call('PATCH', '/api/profile/preferences', { token: user.token, body: { notifySyncResults: false } });
		expect(prefs.body.data.preferences).toMatchObject({ notifySyncResults: false, notifyAiInsights: true });
		mockInstagram('ig_notify_2', { media: ONE_POST });
		await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'EAAB_P' } });
		const events = await Notification.find({ userId: user.userId }).lean();
		expect(events.map((n) => n.event)).toEqual(['account_connected']);
	});

	it('flags a recent post measured at 3× or more of the account average, once', async () => {
		const day = 86_400_000;
		const stamp = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString().replace('.000Z', '+0000');
		const media = [
			...Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, media_type: 'IMAGE', timestamp: stamp(20 + i), like_count: 10, comments_count: 0 })),
			{ id: 'viral', media_type: 'IMAGE', timestamp: stamp(2), like_count: 200, comments_count: 0 },
		];
		const user = await signUp();
		mockInstagram('ig_anomaly_1', { media });
		const accountId = getData(await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'EAAB_A' } })).account.id;
		await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		const anomalies = await Notification.find({ userId: user.userId, event: 'performance_anomaly' }).lean();
		expect(anomalies).toHaveLength(1);
		// avg = (7 × 10 + 200) / 8 = 33.75 → 200 / 33.75 = 5.9×
		expect(anomalies[0].body).toContain('5.9×');
	});
});

describe('profile', () => {
	it('updates the display name and validates preferences', async () => {
		const user = await signUp();
		const renamed = await call('PATCH', '/api/profile', { token: user.token, body: { displayName: '  New Name ' } });
		expect(renamed.body.data.user.profile.displayName).toBe('New Name');
		expect((await call('PATCH', '/api/profile', { token: user.token, body: { displayName: '' } })).status).toBe(400);

		expect((await call('PATCH', '/api/profile/preferences', { token: user.token, body: { timeZone: 'Mars/Olympus' } })).status).toBe(400);
		expect((await call('PATCH', '/api/profile/preferences', { token: user.token, body: { notifyAiInsights: 'yes' } })).status).toBe(400);
		const ok = await call('PATCH', '/api/profile/preferences', { token: user.token, body: { timeZone: 'Asia/Kolkata' } });
		expect(ok.body.data.preferences.timeZone).toBe('Asia/Kolkata');
		expect((await call('GET', '/api/profile/preferences', { token: user.token })).body.data.preferences.timeZone).toBe('Asia/Kolkata');
	});
});
