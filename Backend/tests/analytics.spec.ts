import { afterEach, describe, expect, it, vi } from 'vitest';

import { overrideConfig } from '../src/config/env';
import { acquireSyncLease } from '../src/db/accounts';
import { ConnectedAccount, ContentItem, SyncRun } from '../src/models';
import { buildAnalyticsContext, buildPriorityTasks, formatName, computeHeatmap, computePostingRecommendation, computeScores, detectTrends, explainPost, needsImprovement, topPerformers } from '../src/services/analytics';
import { IntelligencePost } from '../src/services/intelligence';
import { runScheduledSyncs } from '../src/services/syncScheduler';
import { call, signUp } from './helpers';

// Meta, Instagram's CDN and Gemini are mocked at the fetch boundary. Fixtures exist only in the test runtime.

const DAY = 86_400_000;
const PAGE = 25;

interface Media {
	id: string;
	caption: string;
	media_type: string;
	media_product_type: string;
	timestamp: string;
	like_count: number;
	comments_count: number;
	media_url?: string;
	thumbnail_url?: string;
	insights?: { data: Array<{ name: string; values: Array<{ value: number }> }> };
}

/** `count` posts, newest first (index 0 is the newest), one every `spacingHours`. */
function makeMedia(count: number, options: { startDaysAgo?: number; spacingHours?: number; idPrefix?: string } = {}): Media[] {
	const start = Date.now() - (options.startDaysAgo ?? 5) * DAY;
	return Array.from({ length: count }, (_, i) => {
		const reel = i % 3 === 0;
		const views = reel ? 1000 + ((i * 37) % 900) * 5 : 300 + ((i * 53) % 400);
		return {
			id: `${options.idPrefix ?? 'p'}_${i}`,
			caption: reel ? `Quick recipe tutorial ${i} #recipes` : `Weekend photo ${i} #life`,
			media_type: reel ? 'VIDEO' : 'IMAGE',
			media_product_type: reel ? 'REELS' : 'FEED',
			timestamp: new Date(start - i * (options.spacingHours ?? 20) * 3_600_000).toISOString().replace('.000Z', '+0000'),
			like_count: Math.round(views / 10),
			comments_count: (i * 7) % 13,
			...(reel ? { media_url: `https://scontent.cdninstagram.com/v/${i}.mp4`, thumbnail_url: `https://scontent.cdninstagram.com/t/${i}.jpg` } : { media_url: `https://scontent.cdninstagram.com/i/${i}.jpg` }),
			insights: {
				data: [
					{ name: 'views', values: [{ value: views }] },
					{ name: 'reach', values: [{ value: Math.round(views * 0.7) }] },
					{ name: 'saved', values: [{ value: Math.round(views / 100) }] },
					{ name: 'shares', values: [{ value: Math.round(views / 150) }] },
				],
			},
		};
	});
}

interface MockState {
	igId: string;
	media: Media[];
	/** Respond with a Meta throttling error for media pages at or after this page index (0-based). */
	throttleFromPage?: number;
	reelWatch?: (id: string) => { avg: number; total: number } | null;
	gemini?: (body: any) => unknown;
	videoBytes?: number;
	refreshMediaUrl?: string | null;
	/** The profile request answers with Meta's revoked-token error (code 190). */
	revoked?: boolean;
}

function install(state: MockState) {
	const calls: string[] = [];
	const geminiBodies: any[] = [];
	globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
		const url = String(input);
		calls.push(url);
		const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
		if (url.includes('generativelanguage.googleapis.com')) {
			const body = JSON.parse(String(init?.body));
			geminiBodies.push(body);
			if (!state.gemini) return json({ error: 'not mocked' }, 500);
			return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(state.gemini(body)) }] } }] });
		}
		if (url.includes('cdninstagram.com')) {
			if (url.endsWith('.mp4')) return new Response(new Uint8Array(state.videoBytes ?? 2048), { status: 200, headers: { 'content-type': 'video/mp4' } });
			return new Response(new Uint8Array(512), { status: 200, headers: { 'content-type': 'image/jpeg' } });
		}
		if (url.includes('/me/accounts')) {
			return json({ data: [{ id: 'page', name: 'Page', instagram_business_account: { id: state.igId, username: `${state.igId}_user`, name: 'Creator' } }] });
		}
		const parsed = new URL(url);
		if (parsed.pathname.endsWith(`/${state.igId}/media`)) {
			const after = Number(parsed.searchParams.get('after') ?? 0);
			if (state.throttleFromPage !== undefined && after / PAGE >= state.throttleFromPage) {
				return json({ error: { message: 'Application request limit reached', code: 4 } }, 400);
			}
			const slice = state.media.slice(after, after + PAGE);
			const next = after + PAGE < state.media.length ? `https://graph.facebook.com/v21.0/${state.igId}/media?limit=${PAGE}&after=${after + PAGE}&access_token=x` : undefined;
			return json({ data: slice, paging: next ? { next } : {} });
		}
		if (parsed.pathname.endsWith(`/${state.igId}/insights`)) {
			return json({ data: [{ name: 'reach', period: 'day', total_value: { value: 5400 } }, { name: 'views', period: 'day', total_value: { value: 12000 } }] });
		}
		const mediaInsights = parsed.pathname.match(/\/(p_\d+|n_\d+)\/insights$/);
		if (mediaInsights) {
			const watch = state.reelWatch?.(mediaInsights[1]);
			return json({ data: watch ? [{ name: 'ig_reels_avg_watch_time', values: [{ value: watch.avg }] }, { name: 'ig_reels_video_view_total_time', values: [{ value: watch.total }] }] : [] });
		}
		if (parsed.pathname.match(/\/(p_\d+)$/)) {
			return state.refreshMediaUrl ? json({ media_url: state.refreshMediaUrl }) : json({ error: { message: 'nope', code: 100 } }, 400);
		}
		if (state.revoked && (parsed.pathname.endsWith(`/${state.igId}`) || parsed.pathname.endsWith('/me'))) {
			return json({ error: { message: 'Error validating access token', code: 190 } }, 400);
		}
		if (parsed.pathname.endsWith(`/${state.igId}`)) {
			return json({ id: state.igId, username: `${state.igId}_user`, name: 'Creator', followers_count: 5000, follows_count: 10, media_count: state.media.length });
		}
		return json({});
	}) as any;
	return { calls, geminiBodies };
}

const originalFetch = globalThis.fetch;
let restore: Array<() => void> = [];

afterEach(() => {
	globalThis.fetch = originalFetch;
	for (const r of restore) r();
	restore = [];
});

async function connect(state: MockState) {
	const user = await signUp();
	const mock = install(state);
	const res = await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'EAAB_ANALYTICS_SECRET' } });
	expect(res.status).toBe(200);
	return { user, accountId: res.body.data.account.id as string, ...mock };
}

describe('Instagram sync: complete history, idempotent, incremental', () => {
	it('syncs every page beyond 200 posts and records a complete full sync', async () => {
		const state: MockState = { igId: 'ig_full_1', media: makeMedia(310) };
		const { accountId, calls } = await connect(state);

		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(310);
		expect(calls.filter((u) => new URL(u).pathname.endsWith('/ig_full_1/media'))).toHaveLength(13);
		const run = await SyncRun.findOne({ connectedAccountId: accountId }).sort({ startedAt: -1 }).lean();
		expect(run).toMatchObject({ status: 'completed', mode: 'full', itemsFetched: 310, newItems: 310, reachedEnd: true, pagesFetched: 13, profileMediaCount: 310 });
		const account = await ConnectedAccount.findById(accountId).lean();
		expect(account?.lastFullSyncAt).toBeInstanceOf(Date);

		// Account insights use the current total_value API and never the removed `impressions` metric.
		const insightCall = calls.find((u) => new URL(u).pathname.endsWith('/ig_full_1/insights')) as string;
		expect(new URL(insightCall).searchParams.get('metric_type')).toBe('total_value');
		expect(insightCall).not.toContain('impressions');
	});

	it('re-syncing never duplicates posts; incremental runs stop at already-synced older pages and detect new posts', async () => {
		const state: MockState = { igId: 'ig_inc_1', media: makeMedia(150, { startDaysAgo: 40 }) };
		const { user, accountId, calls } = await connect(state);
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(150);

		// A new post appears at the top of the feed.
		state.media = [{ ...makeMedia(1, { startDaysAgo: 0, idPrefix: 'n' })[0] }, ...state.media];
		calls.length = 0;
		const res = await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		expect(res.status).toBe(200);
		expect(res.body.data).toMatchObject({ status: 'completed', mode: 'incremental', newPosts: 1 });
		// Page 1 holds the new post; page 2 holds only stored posts older than the refresh window, so paging stops there (not 7 pages).
		expect(calls.filter((u) => new URL(u).pathname.endsWith('/ig_inc_1/media'))).toHaveLength(2);
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(151);

		// An explicit full sync walks everything again, still without duplicates.
		const full = await call('POST', `/api/accounts/${accountId}/sync?mode=full`, { token: user.token });
		expect(full.body.data).toMatchObject({ status: 'completed', mode: 'full', newPosts: 0, postsSynced: 151 });
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(151);

		expect((await call('POST', `/api/accounts/${accountId}/sync?mode=sideways`, { token: user.token })).status).toBe(400);
	});

	it('keeps what was fetched and reports a partial sync when Meta throttles mid-pagination', async () => {
		const state: MockState = { igId: 'ig_throttle_1', media: makeMedia(120), throttleFromPage: 2 };
		const { user, accountId } = await connect(state);
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(50);

		const status = await call('GET', `/api/accounts/${accountId}/sync-status`, { token: user.token });
		expect(status.status).toBe(200);
		expect(status.body.data).toMatchObject({ state: 'partial', storedCount: 50, profileMediaCount: 120, lastRun: { status: 'partial', errorCode: 'RATE_LIMITED', reachedEnd: false } });
		expect(status.body.data.notes.join(' ')).toContain('120');
		// A partial run never counts as a complete full sync, so the next run is full again.
		expect((await ConnectedAccount.findById(accountId).lean())?.lastFullSyncAt).toBeNull();

		state.throttleFromPage = undefined;
		const res = await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		expect(res.body.data).toMatchObject({ status: 'completed', mode: 'full', newPosts: 70 });
		expect(await ContentItem.countDocuments({ connectedAccountId: accountId })).toBe(120);
	});

	it('refuses a second concurrent sync of the same account', async () => {
		const { user, accountId } = await connect({ igId: 'ig_lease_1', media: makeMedia(3) });
		expect(await acquireSyncLease(accountId, Date.now(), 60_000)).toBe(true);
		const res = await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		expect(res.status).toBe(409);
		expect(res.body.error.code).toBe('SYNC_IN_PROGRESS');
	});

	it('stores Reels watch time as extra metrics without overwriting it with missing values', async () => {
		const state: MockState = { igId: 'ig_watch_1', media: makeMedia(9), reelWatch: (id) => ({ avg: 4000 + Number(id.split('_')[1]) * 100, total: 90_000 }) };
		const { user, accountId } = await connect(state);
		const reel = await ContentItem.findOne({ connectedAccountId: accountId, platformContentId: 'p_3' }).lean();
		expect(reel?.extraMetrics).toEqual({ avgWatchTimeMs: 4300, totalWatchTimeMs: 90_000 });
		const photo = await ContentItem.findOne({ connectedAccountId: accountId, platformContentId: 'p_1' }).lean();
		expect(photo?.extraMetrics).toBeNull();

		state.reelWatch = () => null;
		await call('POST', `/api/accounts/${accountId}/sync?mode=full`, { token: user.token });
		expect((await ContentItem.findOne({ connectedAccountId: accountId, platformContentId: 'p_3' }).lean())?.extraMetrics).toEqual({ avgWatchTimeMs: 4300, totalWatchTimeMs: 90_000 });
	});

	it('the scheduler syncs connected accounts whose data is stale', async () => {
		const { accountId } = await connect({ igId: 'ig_sched_1', media: makeMedia(4) });
		const stale = new Date(Date.now() - 7 * 3_600_000);
		await ConnectedAccount.updateOne({ _id: accountId }, { $set: { lastSyncedAt: stale } });
		const attempted = await runScheduledSyncs(Date.now());
		expect(attempted).toBeGreaterThanOrEqual(1);
		expect((await ConnectedAccount.findById(accountId).lean())?.lastSyncedAt?.getTime()).toBeGreaterThan(stale.getTime());

		restore.push(overrideConfig({ AUTO_SYNC_INTERVAL_MS: 0 }));
		expect(await runScheduledSyncs(Date.now())).toBe(0);
	});
});

function post(id: string, overrides: Partial<Omit<IntelligencePost, 'metrics'>> & { metrics?: Partial<IntelligencePost['metrics']> } = {}): IntelligencePost {
	return {
		id,
		format: 'POST',
		caption: null,
		permalink: null,
		previewUrl: null,
		publishedAt: new Date(Date.now() - 10 * DAY).toISOString(),
		interactions: null,
		engagementRate: null,
		vsBaselinePercent: null,
		...overrides,
		metrics: { views: null, reach: null, likes: null, comments: null, saves: null, shares: null, totalInteractions: null, ...overrides.metrics },
	};
}

describe('analytics (unit)', () => {
	it('scores posts by percentile over available metrics only; missing metrics are not zeros', () => {
		const posts = Array.from({ length: 8 }, (_, i) => post(`s${i}`, { metrics: { views: (i + 1) * 100, likes: (i + 1) * 10 } }));
		posts.push(post('no_views', { metrics: { likes: 80 } }));
		posts.push(post('nothing'));
		const scores = computeScores(posts);
		expect(scores.get('s7')?.score).toBeGreaterThan(scores.get('s0')?.score as number);
		expect(scores.get('no_views')?.basis).toEqual(['likes']);
		expect(scores.get('nothing')).toEqual({ score: null, basis: [], percentiles: {} });
	});

	it('recommends a posting window only with enough history, with numbers and confidence', () => {
		const now = Date.now();
		// 40 posts: Wednesdays 18:00 UTC do far better.
		const base = Date.UTC(2026, 0, 7, 18); // a Wednesday
		const posts = Array.from({ length: 40 }, (_, i) => {
			const strong = i % 4 === 0;
			const t = strong ? base + i * 7 * DAY : base + i * 7 * DAY + DAY * 2 - 10 * 3_600_000;
			return post(`t${i}`, { publishedAt: new Date(t).toISOString(), interactions: strong ? 500 : 100, metrics: { views: strong ? 5000 : 1000, likes: strong ? 450 : 90 } });
		});
		const ctx = buildAnalyticsContext(posts, [], 'UTC', now);
		const rec = computePostingRecommendation(ctx);
		expect(rec.sufficient).toBe(true);
		expect(rec.bestDay?.label).toBe('Wednesday');
		expect(rec.bestTime?.startHour).toBe(18);
		expect(rec.strongMetrics).toContain('views');
		expect(rec.why[0]).toMatch(/10 posts published on Wednesdays/);

		const few = computePostingRecommendation(buildAnalyticsContext(posts.slice(0, 10), [], 'UTC', now));
		expect(few.sufficient).toBe(false);
		expect(few.bestDay).toBeNull();
	});

	it('detects a format trend and explains posts with measured, directional reasons', () => {
		const now = Date.now();
		const posts = Array.from({ length: 30 }, (_, i) => {
			const reel = i % 2 === 0;
			return post(`f${i}`, {
				format: reel ? 'REEL' : 'POST',
				publishedAt: new Date(now - (5 + i) * DAY).toISOString(),
				interactions: reel ? 300 : 100,
				engagementRate: reel ? 6 : 2,
				metrics: { views: reel ? 3000 + i : 1000 + i, likes: reel ? 280 : 90, comments: 20, shares: reel ? 30 : 5, saves: reel ? 20 : 5, reach: reel ? 2000 : 800 },
			});
		});
		const ctx = buildAnalyticsContext(posts, [], 'UTC', now);
		const rec = computePostingRecommendation(ctx);
		const trends = detectTrends(ctx, rec);
		const format = trends.trends.find((t) => t.id === 'format_REEL');
		expect(format?.direction).toBe('up');
		expect(format?.headline).toMatch(/Reels get .* views/);
		expect(trends.unavailable.map((u) => u.topic)).toContain('Video length');

		const top = ctx.posts.find((p) => p.id === 'f0')!;
		const low = ctx.posts.find((p) => p.id === 'f1')!;
		const topReasons = explainPost(ctx, top, 'top', rec, trends);
		expect(topReasons.reasons.length).toBeGreaterThan(0);
		expect(topReasons.reasons.every((r) => r.direction === 'positive')).toBe(true);
		const lowReasons = explainPost(ctx, low, 'improve', rec, trends);
		expect(lowReasons.reasons.every((r) => r.direction === 'negative')).toBe(true);
		expect(lowReasons.reasons.find((r) => r.area === 'views')?.statement).toMatch(/below your typical post/);
		expect(lowReasons.improvements.length).toBeGreaterThan(0);
	});
});

describe('analytics at scale (unit)', () => {
	it('analyzes 10,000 posts (Instagram’s API maximum) within a request budget', () => {
		const now = Date.now();
		const words = ['recipe', 'travel', 'workout', 'skincare', 'budget', 'morning', 'garden', 'coffee', 'design', 'study', 'camera', 'beach'];
		const posts = Array.from({ length: 10_000 }, (_, i) =>
			post(`x${i}`, {
				format: (['REEL', 'POST', 'CAROUSEL'] as const)[i % 3],
				caption: `${words[i % 12]} ${words[(i * 7) % 12]} tips number${i % 400} #${words[(i * 5) % 12]} #tag${i % 50}`,
				publishedAt: new Date(now - (4 + (i % 1500)) * DAY - (i % 24) * 3_600_000).toISOString(),
				interactions: 50 + ((i * 31) % 500),
				engagementRate: 1 + ((i * 13) % 50) / 10,
				metrics: { views: 1000 + ((i * 97) % 9000), likes: 40 + ((i * 31) % 450), comments: (i * 7) % 60, shares: (i * 3) % 40, saves: (i * 11) % 30, reach: 800 + ((i * 89) % 7000) },
			}),
		);
		const started = performance.now();
		const ctx = buildAnalyticsContext(posts, [], 'UTC', now);
		const rec = computePostingRecommendation(ctx);
		const trends = detectTrends(ctx, rec);
		buildPriorityTasks(trends, needsImprovement(ctx), rec, ctx);
		for (const metric of ['score', 'views', 'likes', 'engagementRate'] as const) computeHeatmap(ctx, metric);
		for (const p of topPerformers(ctx).slice(0, 10)) explainPost(ctx, p, 'top', rec, trends);
		const elapsed = performance.now() - started;
		expect(ctx.posts.filter((p) => p.score !== null)).toHaveLength(10_000);
		expect(rec.sufficient).toBe(true);
		expect(elapsed).toBeLessThan(3_000);
	});
});

describe('analysis API', () => {
	const ENDPOINTS = [
		'/api/intelligence/dashboard',
		'/api/intelligence/timing',
		'/api/intelligence/performers',
		'/api/intelligence/trends',
		'/api/intelligence/trends/ai',
		'/api/intelligence/media/x/performance-analysis',
		'/api/intelligence/media/x/video-analysis',
		'/api/accounts/x/sync-status',
	];
	it.each(ENDPOINTS)('GET %s requires authentication', async (path) => {
		expect((await call('GET', path)).status).toBe(401);
	});

	it('serves the dashboard, performers, timing and trends from synced data', async () => {
		const { user, accountId } = await connect({ igId: 'ig_api_1', media: makeMedia(60, { startDaysAgo: 4 }) });
		const auth = { token: user.token };

		const dash = (await call('GET', `/api/intelligence/dashboard?accountId=${accountId}&tz=UTC`, auth)).body.data.dashboard;
		expect(dash.summary.totalPosts).toBe(60);
		expect(dash.summary.views.postsWithData).toBe(60);
		expect(dash.summary.likes.total).toBeGreaterThan(0);
		expect(dash.summary.bestPost.score).toBeGreaterThanOrEqual(50);
		expect(dash.sync).toMatchObject({ state: 'completed', storedCount: 60 });
		expect(dash.trend.points.length).toBeGreaterThan(0);
		expect(dash.accountInsights.reach.value).toBe(5400);
		expect(dash.scoreDefinition).toContain('percentile');

		const top = (await call('GET', `/api/intelligence/performers?accountId=${accountId}&type=top&limit=5`, auth)).body.data;
		expect(top.sufficient).toBe(true);
		expect(top.items).toHaveLength(5);
		const scores = top.items.map((i: any) => i.post.score);
		expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
		expect(top.items[0].reasons.every((r: any) => r.direction === 'positive')).toBe(true);

		const improve = (await call('GET', `/api/intelligence/performers?accountId=${accountId}&type=improve&limit=5`, auth)).body.data;
		expect(improve.items[0].post.score).toBeLessThan(top.items[0].post.score);
		expect(improve.items[0].vsAccount.viewsPercent).toBeLessThan(0);
		expect((await call('GET', `/api/intelligence/performers?accountId=${accountId}&type=worst`, auth)).status).toBe(400);

		const timing = (await call('GET', `/api/intelligence/timing?accountId=${accountId}&tz=UTC`, auth)).body.data;
		expect(Object.keys(timing.heatmaps)).toEqual(['score', 'views', 'likes', 'engagementRate', 'interactions']);
		expect(timing.heatmaps.views.sufficient).toBe(true);
		expect(timing.recommendation.sufficient).toBe(true);

		const trends = (await call('GET', `/api/intelligence/trends?accountId=${accountId}`, auth)).body.data;
		expect(trends.sufficient).toBe(true);
		expect(Array.isArray(trends.tasks)).toBe(true);
		for (const task of trends.tasks) expect(task).toMatchObject({ priority: expect.any(Number), impact: expect.any(String), reason: expect.any(String), action: expect.any(String) });

		const id = top.items[0].post.id;
		const detail = (await call('GET', `/api/intelligence/media/${id}?accountId=${accountId}`, auth)).body.data;
		expect(detail.analysis.kind).toBe('top');
		expect(detail.analysis.comparisons.similar.postCount).toBeGreaterThan(0);
		expect(JSON.stringify(detail)).not.toContain('EAAB_ANALYTICS_SECRET');

		// Another user cannot read this account's analysis.
		const other = await signUp();
		expect((await call('GET', `/api/intelligence/performers?accountId=${accountId}`, { token: other.token })).status).toBe(404);
	});

	it('keeps AI interpretation separate from measured data and sends Gemini the cover image', async () => {
		const state: MockState = {
			igId: 'ig_ai_1',
			media: makeMedia(30, { startDaysAgo: 4 }),
			gemini: (body) => {
				const prompt = body.contents[0].parts.at(-1).text as string;
				if (prompt.includes('measured these patterns')) {
					return { summary: 'Reels lead.', interpretations: [{ trendId: 'made_up', interpretation: 'x', recommendation: 'y' }], opportunities: [{ title: 'Invented idea', rationale: 'r', suggestion: 's', trendIds: ['not_detected'] }] };
				}
				return {
					summary: 'Above average.',
					reasons: [{ title: 'Clear recipe close-up on cover', detail: 'The cover shows the finished dish.', area: 'visual' }],
					improvements: [{ action: 'Repeat the close-up cover', why: 'It matches your best posts.' }],
					cannotConfirm: ['Retention'],
				};
			},
		};
		const { user, accountId, geminiBodies } = await connect(state);
		restore.push(overrideConfig({ GEMINI_API_KEY: 'test-gemini-key' }));

		const top = (await call('GET', `/api/intelligence/performers?accountId=${accountId}&type=top&limit=1`, { token: user.token })).body.data.items[0];
		const res = await call('GET', `/api/intelligence/media/${top.post.id}/performance-analysis?accountId=${accountId}`, { token: user.token });
		expect(res.status).toBe(200);
		expect(res.body.data.observed.reasons.length).toBeGreaterThan(0);
		expect(res.body.data.ai).toMatchObject({ kind: 'top', usedCoverImage: true, reasons: [{ area: 'visual' }] });
		const sent = geminiBodies.at(-1);
		expect(sent.contents[0].parts[0].inline_data.mime_type).toBe('image/jpeg');
		expect(JSON.stringify(sent)).not.toContain('EAAB_ANALYTICS_SECRET');

		const trendsAi = await call('GET', `/api/intelligence/trends/ai?accountId=${accountId}`, { token: user.token });
		expect(trendsAi.status).toBe(200);
		// Interpretations for trends that were not detected are dropped.
		expect(trendsAi.body.data.interpretations).toEqual([]);
		// So are opportunities that cite no detected trend.
		expect(trendsAi.body.data.opportunities).toEqual([]);
	});

	it('deep video analysis sends the video itself and refuses images and unavailable files', async () => {
		const state: MockState = {
			igId: 'ig_video_1',
			media: makeMedia(12, { startDaysAgo: 4 }),
			gemini: () => ({
				summary: 'Fast recipe demo.',
				hook: { opening: 'Pan sizzling, text "3 minutes"', strength: 'strong', topicClearQuickly: true, assessment: 'Clear.' },
				structure: { intro: 'a', mainContent: 'b', pacing: 'c', transitions: 'd', story: 'e', endingCta: 'f' },
				visual: { framing: 'a', textOverlays: 'b', clarity: 'c', sceneChanges: 'd', branding: 'e', cover: 'f' },
				engagement: { whyViewersWatched: 'a', shareability: 'b', saveability: 'c', commentPotential: 'd', ctaEffectiveness: 'e' },
				keyMoments: [{ timestamp: '00:02', note: 'Result shown' }, { timestamp: 'later', note: 'dropped' }],
				recommendations: ['Keep the result first'],
				cannotAssess: ['Audio licensing'],
			}),
		};
		const { user, accountId, geminiBodies } = await connect(state);
		restore.push(overrideConfig({ GEMINI_API_KEY: 'test-gemini-key' }));
		const items = await ContentItem.find({ connectedAccountId: accountId }).lean();
		const reel = items.find((i) => i.platformContentId === 'p_0')!;
		const photo = items.find((i) => i.platformContentId === 'p_1')!;

		const res = await call('GET', `/api/intelligence/media/${reel._id}/video-analysis?accountId=${accountId}`, { token: user.token });
		expect(res.status).toBe(200);
		expect(res.body.data.observed.metrics.views).toBe(reel.metrics.views);
		expect(res.body.data.ai.hook.strength).toBe('strong');
		expect(res.body.data.ai.keyMoments).toEqual([{ timestamp: '00:02', note: 'Result shown' }]);
		expect(geminiBodies.at(-1).contents[0].parts[0].inline_data.mime_type).toBe('video/mp4');

		expect((await call('GET', `/api/intelligence/media/${photo._id}/video-analysis?accountId=${accountId}`, { token: user.token })).body.error.code).toBe('NOT_A_VIDEO');

		// No downloadable file (e.g. copyrighted audio) and the refresh finds none either.
		const other = items.find((i) => i.platformContentId === 'p_3')!;
		await ContentItem.updateOne({ _id: other._id }, { $set: { mediaUrl: null } });
		const missing = await call('GET', `/api/intelligence/media/${other._id}/video-analysis?accountId=${accountId}`, { token: user.token });
		expect(missing.status).toBe(422);
		expect(missing.body.error.code).toBe('VIDEO_NOT_AVAILABLE');
	});
});

describe('edge cases', () => {
	it('no connected account: dashboard is empty and analysis endpoints answer 404, never fake data', async () => {
		const { token } = await signUp();
		expect((await call('GET', '/api/intelligence/dashboard', { token })).body.data).toEqual({ accounts: [], dashboard: null });
		for (const path of ['/api/intelligence/performers', '/api/intelligence/trends', '/api/intelligence/timing']) {
			const res = await call('GET', path, { token });
			expect(res.status).toBe(404);
			expect(res.body.error.code).toBe('NO_INSTAGRAM_ACCOUNT');
		}
	});

	it('connected account with no content: zero posts, nulls for metrics, insufficient rankings and trends', async () => {
		const { user, accountId } = await connect({ igId: 'ig_empty_1', media: [] });
		const dash = (await call('GET', `/api/intelligence/dashboard?accountId=${accountId}`, { token: user.token })).body.data.dashboard;
		expect(dash.summary).toMatchObject({ totalPosts: 0, bestPost: null, views: { total: null, average: null, median: null, postsWithData: 0 } });
		expect(dash.tasks).toEqual([]);
		const performers = (await call('GET', `/api/intelligence/performers?accountId=${accountId}`, { token: user.token })).body.data;
		expect(performers).toMatchObject({ sufficient: false, total: 0, items: [] });
		expect((await call('GET', `/api/intelligence/trends?accountId=${accountId}`, { token: user.token })).body.data.sufficient).toBe(false);
		expect((await call('GET', `/api/intelligence/trends/ai?accountId=${accountId}`, { token: user.token })).status).toBe(422);
	});

	it('AI unavailable: measured analysis still works, AI endpoints say so truthfully', async () => {
		restore.push(overrideConfig({ GEMINI_API_KEY: undefined }));
		const { user, accountId } = await connect({ igId: 'ig_noai_1', media: makeMedia(12, { startDaysAgo: 4 }) });
		const reel = await ContentItem.findOne({ connectedAccountId: accountId, platformContentId: 'p_0' }).lean();
		const why = await call('GET', `/api/intelligence/media/${reel!._id}/performance-analysis?accountId=${accountId}`, { token: user.token });
		expect(why.status).toBe(503);
		expect(why.body.error.code).toBe('AI_UNAVAILABLE');
		const video = await call('GET', `/api/intelligence/media/${reel!._id}/video-analysis?accountId=${accountId}`, { token: user.token });
		expect(video.status).toBe(200);
		expect(video.body.data).toMatchObject({ aiConfigured: false, ai: null, observed: { metrics: { views: reel!.metrics.views } } });
		const detail = (await call('GET', `/api/intelligence/media/${reel!._id}?accountId=${accountId}`, { token: user.token })).body.data;
		expect(detail.analysis.comparisons.account.postCount).toBe(11);
	});

	it('revoked token: the sync fails truthfully and the account asks for reconnection', async () => {
		const state: MockState = { igId: 'ig_revoked_1', media: makeMedia(5) };
		const { user, accountId } = await connect(state);
		state.revoked = true;
		const res = await call('POST', `/api/accounts/${accountId}/sync`, { token: user.token });
		expect(res.status).toBe(400);
		expect(res.body.error.code).toBe('INVALID_TOKEN');
		expect((await ConnectedAccount.findById(accountId).lean())?.status).toBe('reauthorization_required');
		const status = (await call('GET', `/api/accounts/${accountId}/sync-status`, { token: user.token })).body.data;
		expect(status).toMatchObject({ state: 'failed', storedCount: 5, lastRun: { status: 'failed', errorCode: 'INVALID_TOKEN' } });
		// Previously synced data stays readable.
		expect((await call('GET', `/api/intelligence/dashboard?accountId=${accountId}`, { token: user.token })).body.data.dashboard.summary.totalPosts).toBe(5);
	});

	it('multiple connected accounts: each analysis is scoped to the requested account', async () => {
		const user = await signUp();
		install({ igId: 'ig_multi_a', media: makeMedia(8) });
		const a = (await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'TOKEN_A' } })).body.data.account.id;
		install({ igId: 'ig_multi_b', media: makeMedia(3) });
		const b = (await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'TOKEN_B' } })).body.data.account.id;
		const dashA = (await call('GET', `/api/intelligence/dashboard?accountId=${a}`, { token: user.token })).body.data;
		const dashB = (await call('GET', `/api/intelligence/dashboard?accountId=${b}`, { token: user.token })).body.data;
		expect(dashA.accounts).toHaveLength(2);
		expect(dashA.dashboard.summary.totalPosts).toBe(8);
		expect(dashB.dashboard.summary.totalPosts).toBe(3);
	});
});

describe('platform vocabulary (unit)', () => {
	it('names content in each platform’s own terms and never calls YouTube content Reels', () => {
		expect(formatName('CAROUSEL', 'facebook').one).toBe('Album');
		expect(formatName('CAROUSEL', 'linkedin').one).toBe('Multi-image post');
		expect(formatName('POST', 'instagram').one).toBe('Photo');
		expect(formatName('LIVE', 'youtube').one).toBe('Live stream');
		expect(formatName('VIDEO', 'youtube').many).toBe('Videos');
	});

	it('detects video-length patterns where the platform reports duration (YouTube) and states what is not measurable', () => {
		const now = Date.now();
		const posts = Array.from({ length: 30 }, (_, i) =>
			post(`y${i}`, {
				format: 'VIDEO',
				publishedAt: new Date(now - (5 + i) * DAY).toISOString(),
				interactions: i % 2 === 0 ? 400 : 100,
				metrics: { views: i % 2 === 0 ? 8000 : 2000, likes: i % 2 === 0 ? 380 : 90, comments: 20 },
			}),
		);
		const rows = posts.map((p, i) => ({ id: p.id, extra_metrics: { durationSeconds: i % 2 === 0 ? 420 : 45 } })) as any;
		const ctx = buildAnalyticsContext(posts, rows, 'UTC', now, 'youtube');
		const trends = detectTrends(ctx, computePostingRecommendation(ctx));
		const length = trends.trends.find((t) => t.category === 'length');
		expect(length?.headline).toMatch(/^Videos of 3–10 minutes typically get 8K views/);
		expect(trends.unavailable.map((u) => u.topic)).toContain('Shorts vs long-form');
		expect(trends.unavailable.map((u) => u.topic)).not.toContain('Video length');
		expect(JSON.stringify(trends)).not.toMatch(/Reel/);
	});
});

describe('analysis screen API (period, scope, all platforms)', () => {
	it('no connected account: no analysis, never invented numbers', async () => {
		const { token } = await signUp();
		const res = await call('GET', '/api/intelligence/analysis', { token });
		expect(res.body.data).toEqual({ accounts: [], analysis: null });
		expect((await call('GET', '/api/intelligence/analysis?period=1y', { token })).status).toBe(400);
	});

	it('one account: period sums match stored posts, previous period comparison is real or unavailable', async () => {
		// 30 posts, one every 20h starting 5 days ago: all inside the last 30 days, none in the 30 before.
		const media = makeMedia(30);
		const { user, accountId } = await connect({ igId: 'ig_an_1', media });
		const data = (await call('GET', '/api/intelligence/analysis?period=30d&tz=UTC', { token: user.token })).body.data.analysis;
		expect(data.scope).toBe(accountId);
		expect(data.accounts).toHaveLength(1);
		expect(data.accounts[0].contentCount).toBe(30);
		const tile = (m: string) => data.performance.tiles.find((t: any) => t.metric === m);
		const views = media.reduce((s, m) => s + (m.insights?.data.find((d) => d.name === 'views')?.values[0].value ?? 0), 0);
		expect(tile('views').value).toBe(views);
		expect(tile('likes').value).toBe(media.reduce((s, m) => s + m.like_count, 0));
		expect(tile('posts').value).toBe(30);
		// Nothing was published in the previous 30 days: no fake percentage.
		expect(tile('views').changePercent).toBeNull();
		expect(data.distribution.kind).toBe('format');
		expect(data.distribution.items.map((i: any) => i.label).sort()).toEqual(['Photos', 'Reels']);
		expect(data.trend.series).toHaveLength(1);
		expect(data.trend.buckets).toHaveLength(30);
		// Daily points in a 30-day range are trailing 7-day windows; 90 days are weekly.
		expect(data.trend.rollingDays).toBe(7);
		const quarter = (await call('GET', '/api/intelligence/analysis?period=90d&tz=UTC', { token: user.token })).body.data.analysis;
		expect(quarter.trend.granularity).toBe('week');
		expect(quarter.trend.rollingDays).toBe(1);
		expect(data.top?.kind).toBe('format');
		expect(data.sync.storedCount).toBe(30);

		const top = (await call('GET', '/api/intelligence/analysis/content?type=top&limit=5', { token: user.token })).body.data;
		expect(top.items).toHaveLength(5);
		const scores = top.items.map((i: any) => i.post.score);
		expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
		expect(top.items[0].platform).toBe('instagram');
		expect((await call('GET', '/api/intelligence/analysis/content?type=worst', { token: user.token })).status).toBe(400);

		// A 7-day window holds fewer posts; the 7 days before it are compared for real.
		const week = (await call('GET', '/api/intelligence/analysis?period=7d&tz=UTC', { token: user.token })).body.data.analysis;
		expect(week.performance.postsInPeriod).toBeLessThan(30);
		expect(week.performance.tiles.find((t: any) => t.metric === 'posts').previous).toBeGreaterThan(0);
	});

	it('several accounts: "all" combines only connected accounts, per-account scope never mixes data', async () => {
		const user = await signUp();
		install({ igId: 'ig_an_a', media: makeMedia(20) });
		const a = (await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'TOKEN_A' } })).body.data.account.id;
		install({ igId: 'ig_an_b', media: makeMedia(10) });
		const b = (await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: 'TOKEN_B' } })).body.data.account.id;

		const all = (await call('GET', '/api/intelligence/analysis?tz=UTC', { token: user.token })).body.data.analysis;
		expect(all.scope).toBe('all');
		expect(all.performance.tiles.find((t: any) => t.metric === 'posts').value).toBe(30);
		expect(all.distribution.kind).toBe('platform');
		expect(all.distribution.items.map((i: any) => i.count).sort()).toEqual([10, 20]);
		expect(all.trend.series.map((s: any) => s.accountId).sort()).toEqual([a, b].sort());

		const onlyB = (await call('GET', `/api/intelligence/analysis?scope=${b}&tz=UTC`, { token: user.token })).body.data.analysis;
		expect(onlyB.performance.tiles.find((t: any) => t.metric === 'posts').value).toBe(10);
		expect(onlyB.trend.series.map((s: any) => s.accountId)).toEqual([b]);

		const filtered = (await call('GET', `/api/intelligence/analysis/content?scope=all&type=top&accountId=${b}&limit=30`, { token: user.token })).body.data;
		expect(filtered.items.every((i: any) => i.accountId === b)).toBe(true);
		expect(filtered.total).toBeLessThanOrEqual(10);

		const other = await signUp();
		expect((await call('GET', `/api/intelligence/analysis?scope=${a}`, { token: other.token })).status).toBe(404);
	});
});
