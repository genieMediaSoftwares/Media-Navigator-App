import { afterEach, describe, expect, it, vi } from 'vitest';

import { overrideConfig } from '../src/config/env';
import { findAccountsByUserId } from '../src/db/accounts';
import { ConnectedAccount, ContentItem, PendingConnection } from '../src/models';
import { getPlatformCredentials, updatePlatformCredentials } from '../src/services/credentials';
import { classifyFacebookPost } from '../src/services/providers/facebook';
import { classifyLinkedInPost } from '../src/services/providers/linkedin';
import { call, getData, json, signUp } from './helpers';

// Platform APIs are mocked at the fetch boundary. These tests check request construction, parsing,
// null semantics and security properties of each adapter; they are not a substitute for testing
// against the live platforms with real app credentials.

const originalFetch = globalThis.fetch;
let restore: (() => void) | null = null;
afterEach(() => {
	globalThis.fetch = originalFetch;
	restore?.();
	restore = null;
});

type Handler = (url: URL, init?: RequestInit) => Response | undefined;
function mockFetch(handler: Handler) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return handler(new URL(String(input)), init) ?? json({ error: { message: `unmocked ${input}` } }, 404);
	}) as any;
	return calls;
}

describe('SocialProvider: Facebook Pages', () => {
	const pages = [
		{ id: 'page_1', name: 'Bakery One', username: 'bakeryone', access_token: 'PAGE_TOKEN_1', picture: { data: { url: 'https://img/1' } } },
		{ id: 'page_2', name: 'Bakery Two', access_token: 'PAGE_TOKEN_2' },
	];

	function facebookGraph(url: URL): Response | undefined {
		const token = url.searchParams.get('access_token');
		if (url.pathname.endsWith('/me/accounts')) return token === 'FB_USER_TOKEN' ? json({ data: pages }) : json({ error: { message: 'bad', code: 190 } }, 400);
		if (url.pathname.endsWith('/page_1/published_posts')) {
			if (token !== 'PAGE_TOKEN_1') return json({ error: { message: 'bad', code: 190 } }, 400);
			return json({
				data: [
					{
						id: 'page_1_post_a',
						message: 'Fresh bread today',
						created_time: '2026-09-20T08:00:00+0000',
						permalink_url: 'https://facebook.com/page_1/posts/a',
						full_picture: 'https://img/a',
						status_type: 'added_photos',
						attachments: { data: [{ media_type: 'photo', type: 'photo' }] },
						reactions: { summary: { total_count: 12 } },
						comments: { summary: { total_count: 3 } },
						shares: { count: 2 },
						insights: url.searchParams.get('fields')?.includes('insights') ? { data: [{ name: 'post_impressions_unique', values: [{ value: 400 }] }] } : undefined,
					},
					{
						id: 'page_1_post_b',
						message: 'Album',
						created_time: '2026-09-18T08:00:00+0000',
						attachments: { data: [{ media_type: 'album', type: 'album' }] },
						reactions: { summary: { total_count: 0 } },
						comments: { summary: { total_count: 0 } },
					},
				],
			});
		}
		if (url.pathname.endsWith('/page_1/insights')) return json({ data: [{ name: 'page_impressions_unique', period: 'day', values: [{ value: 900, end_time: '2026-09-29T07:00:00+0000' }] }] });
		if (url.pathname.endsWith('/page_1')) return json({ id: 'page_1', name: 'Bakery One', username: 'bakeryone', followers_count: 1500, fan_count: 1400 });
		return undefined;
	}

	it('classifies Facebook posts', () => {
		expect(classifyFacebookPost({ attachments: { data: [{ media_type: 'album' }] } })).toBe('CAROUSEL');
		expect(classifyFacebookPost({ attachments: { data: [{ media_type: 'video', type: 'video_inline' }] } })).toBe('VIDEO');
		expect(classifyFacebookPost({ attachments: { data: [{ media_type: 'video', type: 'reel' }] } })).toBe('REEL');
		// Platform vocabulary: no attachment is a text post; photos and links keep their own type.
		expect(classifyFacebookPost({})).toBe('TEXT');
		expect(classifyFacebookPost({ status_type: 'added_photos' })).toBe('IMAGE');
		expect(classifyFacebookPost({ attachments: { data: [{ media_type: 'photo', type: 'photo' }] } })).toBe('IMAGE');
		expect(classifyFacebookPost({ attachments: { data: [{ media_type: 'link', type: 'share' }] } })).toBe('LINK');
	});

	it('connects a selected Page from a Meta user token, stores only the Page token encrypted, and syncs posts', async () => {
		const user = await signUp();
		const calls = mockFetch(facebookGraph);
		const res = await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'facebook', accessToken: 'FB_USER_TOKEN' } });
		expect(res.status).toBe(200);
		const { selection } = getData(res);
		expect(selection.options.map((o: any) => o.platformAccountId)).toEqual(['page_1', 'page_2']);
		expect(JSON.stringify(res.body)).not.toMatch(/PAGE_TOKEN|FB_USER_TOKEN/);
		const pending = await PendingConnection.findById(selection.id).lean();
		expect(JSON.stringify(pending)).not.toMatch(/PAGE_TOKEN|FB_USER_TOKEN/);

		const other = await signUp();
		expect((await call('GET', `/api/accounts/pending/${selection.id}`, { token: other.token })).status).toBe(404);

		const chosen = await call('POST', `/api/accounts/pending/${selection.id}/select`, { token: user.token, body: { platformAccountId: 'page_1' } });
		expect(chosen.status).toBe(200);
		expect(getData(chosen).account).toMatchObject({ platform: 'facebook', username: 'bakeryone', status: 'connected' });
		// Single use.
		expect((await call('POST', `/api/accounts/pending/${selection.id}/select`, { token: user.token, body: { platformAccountId: 'page_1' } })).status).toBe(404);

		const [account] = await findAccountsByUserId(user.userId);
		expect((await getPlatformCredentials(user.userId, account.token_reference))?.accessToken).toBe('PAGE_TOKEN_1');

		const items = await ContentItem.find({ connectedAccountId: account.id }).sort({ publishedAt: -1 }).lean();
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ platform: 'facebook', format: 'IMAGE', caption: 'Fresh bread today', interactions: 15, metrics: { likes: 12, comments: 3, shares: 2, reach: 400, views: null, saves: null } });
		// Meta omits `shares` when unavailable or zero: stored as null, never as an invented 0.
		expect(items[1]).toMatchObject({ format: 'CAROUSEL', metrics: { likes: 0, comments: 0, shares: null } });

		const overview = getData(await call('GET', `/api/intelligence/overview?accountId=${account.id}`, { token: user.token })).overview;
		expect(overview.account.platform).toBe('facebook');
		expect(overview.summary.followers).toBe(1500);
		expect(overview.summary.reach).toMatchObject({ value: 900 });
		expect(overview.definitions.interactions).toContain('Facebook');

		expect(calls.every((c) => !c.url.includes('FB_USER_TOKEN') || c.url.includes('/me/accounts'))).toBe(true);
	});
});

describe('SocialProvider: YouTube', () => {
	const channel = {
		id: 'UC_channel_1',
		snippet: { title: 'Cooking Channel', customUrl: '@cookingchannel', thumbnails: { default: { url: 'https://yt/avatar' } } },
		statistics: { subscriberCount: '2500', hiddenSubscriberCount: false, videoCount: '2' },
		contentDetails: { relatedPlaylists: { uploads: 'UU_uploads_1' } },
	};

	function google(url: URL, init?: RequestInit): Response | undefined {
		if (url.href === 'https://oauth2.googleapis.com/token') {
			const form = new URLSearchParams(String(init?.body));
			if (form.get('grant_type') === 'authorization_code') {
				if (!form.get('code_verifier')) return json({ error: 'invalid_grant', error_description: 'Missing code verifier.' }, 400);
				return json({ access_token: 'YT_ACCESS_1', refresh_token: 'YT_REFRESH_1', expires_in: 3599, scope: 'youtube.readonly' });
			}
			if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'YT_REFRESH_1') return json({ access_token: 'YT_ACCESS_2', expires_in: 3599 });
			return json({ error: 'invalid_grant' }, 400);
		}
		const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
		if (!auth?.startsWith('Bearer YT_ACCESS_')) return json({ error: { message: 'Invalid Credentials' } }, 401);
		if (url.pathname === '/youtube/v3/channels') return json({ items: [channel] });
		if (url.pathname === '/youtube/v3/playlistItems') return json({ items: [{ contentDetails: { videoId: 'vid_1' } }, { contentDetails: { videoId: 'vid_2' } }] });
		if (url.pathname === '/youtube/v3/videos') {
			return json({
				items: [
					{ id: 'vid_1', snippet: { title: 'Sourdough basics', publishedAt: '2026-09-01T12:00:00Z', thumbnails: { high: { url: 'https://yt/1' } } }, statistics: { viewCount: '1000', likeCount: '90', commentCount: '10' }, contentDetails: { duration: 'PT15M33S' } },
					// Likes hidden by the creator: the field is absent.
					{ id: 'vid_2', snippet: { title: 'Knife skills', publishedAt: '2026-09-10T12:00:00Z' }, statistics: { viewCount: '500', commentCount: '4' }, liveStreamingDetails: { actualStartTime: '2026-09-10T12:00:00Z' } },
				],
			});
		}
		if (url.hostname === 'youtubeanalytics.googleapis.com') {
			return json({
				columnHeaders: [{ name: 'video' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' }, { name: 'shares' }],
				rows: [['vid_1', 1000, 2500, 150, 7]],
			});
		}
		return undefined;
	}

	it('runs Google OAuth with PKCE, connects the channel and syncs videos with real null semantics', async () => {
		restore = overrideConfig({ GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', GOOGLE_REDIRECT_URI: 'https://api.example/api/accounts/callback/youtube' });
		const user = await signUp();
		const start = getData(await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'youtube' } }));
		const authUrl = new URL(start.authorizationUrl);
		expect(authUrl.origin).toBe('https://accounts.google.com');
		expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
		expect(authUrl.searchParams.get('access_type')).toBe('offline');
		expect(authUrl.toString()).not.toContain('gsecret');

		mockFetch(google);
		const callback = await call('GET', `/api/accounts/callback/youtube?code=c1&state=${encodeURIComponent(authUrl.searchParams.get('state') as string)}`);
		expect(callback.headers.get('Location')).toMatch(/^medianavigator:\/\/oauth\/callback\?status=success&platform=youtube/);

		const [account] = await findAccountsByUserId(user.userId);
		expect(account).toMatchObject({ platform: 'youtube', platform_account_id: 'UC_channel_1', account_username: 'cookingchannel', status: 'connected' });
		const items = await ContentItem.find({ connectedAccountId: account.id }).sort({ publishedAt: 1 }).lean();
		expect(items.map((i) => [i.platformContentId, i.format, i.metrics.views, i.metrics.likes, i.metrics.comments, i.metrics.shares])).toEqual([
			['vid_1', 'VIDEO', 1000, 90, 10, 7],
			// A completed live broadcast is "Live", never relabelled; nothing is classified as a Short (the API has no such field).
			['vid_2', 'LIVE', 500, null, 4, null],
		]);
		expect(items[0].extraMetrics).toEqual({ durationSeconds: 933, estimatedMinutesWatched: 2500, averageViewDurationSeconds: 150 });
		expect(items[1].extraMetrics).toEqual({ durationSeconds: null });

		const dash = getData(await call('GET', `/api/accounts/${account.id}/dashboard`, { token: user.token }));
		expect(dash.metrics.followersCount).toBe(2500);
	});

	it('refreshes an expired Google access token before syncing', async () => {
		// The channel from the previous test belongs to another user (connecting it again would be a 409).
		await ConnectedAccount.deleteMany({ platform: 'youtube' });
		restore = overrideConfig({ GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', GOOGLE_REDIRECT_URI: 'https://api.example/api/accounts/callback/youtube' });
		const user = await signUp();
		const start = getData(await call('GET', '/api/accounts/connect/youtube', { token: user.token }));
		mockFetch(google);
		await call('GET', `/api/accounts/callback/youtube?code=c1&state=${encodeURIComponent(new URL(start.authorizationUrl).searchParams.get('state') as string)}`);
		const [account] = await findAccountsByUserId(user.userId);

		await updatePlatformCredentials(user.userId, account.token_reference, { accessToken: 'YT_ACCESS_OLD_EXPIRED', refreshToken: 'YT_REFRESH_1', expiresAt: Date.now() - 1000 });
		const sync = await call('POST', `/api/accounts/${account.id}/sync`, { token: user.token });
		expect(sync.status).toBe(200);
		expect((await getPlatformCredentials(user.userId, account.token_reference))).toMatchObject({ accessToken: 'YT_ACCESS_2', refreshToken: 'YT_REFRESH_1' });
	});
});

describe('SocialProvider: LinkedIn organization pages', () => {
	function linkedin(url: URL, init?: RequestInit): Response | undefined {
		if (url.href === 'https://www.linkedin.com/oauth/v2/accessToken') return json({ access_token: 'LI_ACCESS', expires_in: 5_184_000 });
		const headers = init?.headers as Record<string, string> | undefined;
		if (headers?.Authorization !== 'Bearer LI_ACCESS') return json({ message: 'Invalid access token' }, 401);
		if (!headers['LinkedIn-Version'] || headers['X-Restli-Protocol-Version'] !== '2.0.0') return json({ message: 'Missing version headers' }, 400);
		if (url.pathname === '/rest/organizationAcls') return json({ elements: [{ organization: 'urn:li:organization:111' }] });
		if (url.pathname === '/rest/organizations/111') return json({ id: 111, localizedName: 'Acme Inc', vanityName: 'acme' });
		if (url.pathname.startsWith('/rest/networkSizes/')) return json({ firstDegreeSize: 4200 });
		if (url.pathname === '/rest/posts') {
			return json({
				elements: [
					{ id: 'urn:li:share:1', commentary: 'We are hiring', publishedAt: Date.parse('2026-09-15T10:00:00Z'), lifecycleState: 'PUBLISHED' },
					{ id: 'urn:li:ugcPost:2', commentary: 'Demo video', publishedAt: Date.parse('2026-09-16T10:00:00Z'), content: { media: { id: 'urn:li:video:9' } }, lifecycleState: 'PUBLISHED' },
				],
			});
		}
		if (url.pathname.startsWith('/rest/socialMetadata/')) {
			const urn = decodeURIComponent(url.pathname.split('/').pop() as string);
			return urn === 'urn:li:share:1'
				? json({ reactionSummaries: { LIKE: { count: 30 }, PRAISE: { count: 5 } }, commentSummary: { count: 4 } })
				: json({ reactionSummaries: {}, commentSummary: { count: 0 } });
		}
		if (url.pathname === '/rest/organizationalEntityShareStatistics') {
			return json({ elements: [{ share: 'urn:li:share:1', totalShareStatistics: { impressionCount: 2000, uniqueImpressionsCount: 1500, clickCount: 60, shareCount: 3, likeCount: 35, commentCount: 4 } }] });
		}
		return undefined;
	}

	it('classifies LinkedIn posts', () => {
		expect(classifyLinkedInPost({ content: { multiImage: {} } })).toBe('CAROUSEL');
		expect(classifyLinkedInPost({ content: { media: { id: 'urn:li:video:1' } } })).toBe('VIDEO');
		expect(classifyLinkedInPost({ content: { media: { id: 'urn:li:image:1' } } })).toBe('IMAGE');
		expect(classifyLinkedInPost({ content: { media: { id: 'urn:li:document:1' } } })).toBe('DOCUMENT');
		expect(classifyLinkedInPost({ content: { article: { title: 'Read this' } } })).toBe('ARTICLE');
		expect(classifyLinkedInPost({ content: { poll: {} } })).toBe('POLL');
		expect(classifyLinkedInPost({})).toBe('TEXT');
	});

	it('connects an administered organization and syncs posts with measured statistics only', async () => {
		restore = overrideConfig({ LINKEDIN_CLIENT_ID: 'lid', LINKEDIN_CLIENT_SECRET: 'lsecret', LINKEDIN_REDIRECT_URI: 'https://api.example/api/accounts/callback/linkedin' });
		const user = await signUp();
		const start = getData(await call('GET', '/api/accounts/connect/linkedin', { token: user.token }));
		const authUrl = new URL(start.authorizationUrl);
		expect(authUrl.searchParams.get('scope')).toBe('r_organization_admin r_organization_social');

		mockFetch(linkedin);
		const callback = await call('GET', `/api/accounts/callback/linkedin?code=c&state=${encodeURIComponent(authUrl.searchParams.get('state') as string)}`);
		expect(callback.headers.get('Location')).toContain('status=success');

		const [account] = await findAccountsByUserId(user.userId);
		expect(account).toMatchObject({ platform: 'linkedin', platform_account_id: '111', account_username: 'acme' });
		const items = await ContentItem.find({ connectedAccountId: account.id }).sort({ publishedAt: 1 }).lean();
		expect(items.map((i) => [i.format, i.metrics.likes, i.metrics.comments, i.metrics.reach, i.metrics.shares])).toEqual([
			['TEXT', 35, 4, 1500, 3],
			['VIDEO', null, 0, null, null],
		]);
		expect(items[0].extraMetrics).toEqual({ impressions: 2000, clicks: 60 });

		const overview = getData(await call('GET', `/api/intelligence/overview?accountId=${account.id}`, { token: user.token })).overview;
		expect(overview.summary.followers).toBe(4200);
		expect(overview.archive.syncedCount).toBe(2);
	});

	it('marks the account for reauthorization when LinkedIn rejects the token', async () => {
		await ConnectedAccount.deleteMany({ platform: 'linkedin' });
		restore = overrideConfig({ LINKEDIN_CLIENT_ID: 'lid', LINKEDIN_CLIENT_SECRET: 'lsecret', LINKEDIN_REDIRECT_URI: 'https://api.example/api/accounts/callback/linkedin' });
		const user = await signUp();
		const start = getData(await call('GET', '/api/accounts/connect/linkedin', { token: user.token }));
		mockFetch(linkedin);
		await call('GET', `/api/accounts/callback/linkedin?code=c&state=${encodeURIComponent(new URL(start.authorizationUrl).searchParams.get('state') as string)}`);
		const [account] = await findAccountsByUserId(user.userId);

		await updatePlatformCredentials(user.userId, account.token_reference, { accessToken: 'LI_REVOKED' });
		const sync = await call('POST', `/api/accounts/${account.id}/sync`, { token: user.token });
		expect(sync.status).toBe(400);
		expect(sync.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
		expect(JSON.stringify(sync.body)).not.toContain('LI_REVOKED');
		expect((await findAccountsByUserId(user.userId))[0].status).toBe('reauthorization_required');
	});
});
