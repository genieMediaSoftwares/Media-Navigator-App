import { afterEach, describe, expect, it, vi } from 'vitest';

import { overrideConfig } from '../src/config/env';
import { AiCache, AiQuestion } from '../src/models';
import { classifyFormat, computeBaseline, computeTierThresholds, computeTiming, interactionsOf, normalizeTimestamp, tierOf, toIntelligencePost } from '../src/services/intelligence';
import { call, signUp } from './helpers';

// Meta and Gemini are mocked at the fetch boundary. These fixtures exist only inside the test runtime.

const DAY = 86_400_000;

interface FixtureMedia {
	id: string;
	caption?: string;
	media_type?: string;
	media_product_type?: string;
	timestamp?: string;
	like_count?: number;
	comments_count?: number;
	insights?: { data: Array<{ name: string; values: Array<{ value: number }> }> };
}

function metaMedia(count: number, options: { withInsights?: boolean } = {}): FixtureMedia[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `m_${i}`,
		caption: `Caption ${i} #tag${i}`,
		media_type: i % 3 === 0 ? 'VIDEO' : i % 3 === 1 ? 'IMAGE' : 'CAROUSEL_ALBUM',
		media_product_type: i % 3 === 0 ? 'REELS' : 'FEED',
		// Oldest first index = oldest post; all at least 10 days old.
		timestamp: new Date(Date.now() - (10 + i) * DAY).toISOString().replace('.000Z', '+0000'),
		like_count: (i + 1) * 10,
		comments_count: i,
		...(options.withInsights && i % 3 === 0 ? { insights: { data: [{ name: 'views', values: [{ value: (i + 1) * 100 }] }, { name: 'reach', values: [{ value: (i + 1) * 50 }] }] } } : {}),
	}));
}

interface MetaMockOptions {
	igId: string;
	followers?: number;
	media: FixtureMedia[];
	/** Reject requests that ask for these insight metrics (simulates unsupported metrics). */
	rejectMetric?: string;
	gemini?: (body: any) => unknown;
}

function installFetchMock(options: MetaMockOptions) {
	const calls: Array<{ url: string; body?: string }> = [];
	const mock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
		const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

		if (url.includes('generativelanguage.googleapis.com')) {
			if (!options.gemini) return json({ error: 'not mocked' }, 500);
			const output = options.gemini(JSON.parse(String(init?.body)));
			return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] });
		}
		if (url.includes('/me/accounts')) {
			return json({ data: [{ id: 'page_1', name: 'Page', instagram_business_account: { id: options.igId, username: `${options.igId}_user`, name: 'Creator' } }] });
		}
		if (url.includes(`/${options.igId}/media`)) {
			const fields = new URL(url).searchParams.get('fields') ?? '';
			if (options.rejectMetric && fields.includes(options.rejectMetric)) {
				return json({ error: { message: 'Unsupported metric', code: 100 } }, 400);
			}
			const withInsights = fields.includes('insights.metric');
			return json({ data: options.media.map((m) => (withInsights ? m : { ...m, insights: undefined })) });
		}
		if (url.includes(`/${options.igId}/insights`)) return json({ data: [] });
		if (url.includes(`/${options.igId}`)) {
			return json({ id: options.igId, username: `${options.igId}_user`, name: 'Creator', followers_count: options.followers ?? 1000, follows_count: 50, media_count: options.media.length });
		}
		return json({});
	});
	globalThis.fetch = mock as any;
	return calls;
}

const originalFetch = globalThis.fetch;
let restoreConfig: (() => void) | null = null;

/** Injects a fake Gemini key for one test; the real key is never loaded by the test suite. */
function setGeminiKey(value: string | undefined) {
	restoreConfig = overrideConfig({ GEMINI_API_KEY: value });
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	restoreConfig?.();
	restoreConfig = null;
});

async function connect(options: MetaMockOptions, token = 'EAAB_INTEL_SECRET_TOKEN') {
	const user = await signUp();
	const calls = installFetchMock(options);
	const res = await call('POST', '/api/accounts/connect', { token: user.token, body: { platform: 'instagram', accessToken: token } });
	expect(res.status).toBe(200);
	return { user, accountId: (res.body as any).data.account.id as string, calls, secret: token };
}

describe('intelligence calculations (unit)', () => {
	it('classifies formats from Meta media fields', () => {
		expect(classifyFormat('VIDEO', 'REELS')).toBe('REEL');
		expect(classifyFormat('CAROUSEL_ALBUM', 'FEED')).toBe('CAROUSEL');
		expect(classifyFormat('IMAGE', 'FEED')).toBe('POST');
		expect(classifyFormat('VIDEO', 'FEED')).toBe('VIDEO');
		expect(classifyFormat('IMAGE', 'STORY')).toBe('STORY');
	});

	it('normalizes Meta timestamps and keeps missing interactions null, not zero', () => {
		expect(normalizeTimestamp('2026-09-25T10:00:00+0000')).toBe('2026-09-25T10:00:00.000Z');
		expect(normalizeTimestamp('garbage')).toBeNull();
		expect(interactionsOf(null, null)).toBeNull();
		expect(interactionsOf(0, 0)).toBe(0);
		expect(interactionsOf(5, null)).toBe(5);
	});

	it('leaves engagement rate null when followers are unknown', () => {
		const post = toIntelligencePost(
			{
				id: 'x', connected_account_id: 'a', platform: 'instagram', provider_media_id: 'p', format: 'POST', media_type: 'IMAGE',
				media_product_type: 'FEED', title: null, caption: null, permalink: null, media_url: null, thumbnail_url: null, timestamp: null,
				published_at: null, like_count: 10, comments_count: 2, views: null, reach: null, saved: null, shares: null, total_interactions: null,
				extra_metrics: null, insights_synced_at: null, created_at: 0, updated_at: 0,
			},
			null,
			6,
		);
		expect(post.engagementRate).toBeNull();
		expect(post.interactions).toBe(12);
		expect(post.vsBaselinePercent).toBe(100);
		expect(post.metrics.views).toBeNull();
	});

	it('refuses timing patterns without enough history', () => {
		const timing = computeTiming([], 'UTC');
		expect(timing.sufficient).toBe(false);
		expect(timing.heatmap).toEqual([]);
		expect(timing.windows).toEqual([]);
	});
});

describe('content tiers (unit)', () => {
	const row = (id: string, interactions: number, daysAgo: number) => ({
		id, connected_account_id: 'a', platform: 'instagram' as const, provider_media_id: id, format: 'POST' as const, media_type: 'IMAGE',
		media_product_type: 'FEED', title: null, caption: null, permalink: null, media_url: null, thumbnail_url: null, timestamp: null,
		published_at: new Date(Date.now() - daysAgo * DAY).toISOString(), like_count: interactions, comments_count: 0, views: null, reach: null,
		saved: null, shares: null, total_interactions: null, extra_metrics: null, insights_synced_at: null, created_at: 0, updated_at: 0,
	});

	it('classifies against the typical (median) post, not the viral-skewed mean', () => {
		const rows = [1, 2, 8, 8, 8, 9, 20, 100].map((n, i) => row(`p${i}`, n, 10)).concat(row('fresh', 1, 1));
		const baseline = computeBaseline(rows);
		const posts = rows.map((r) => toIntelligencePost(r, 1000, baseline.avgInteractions));
		const tiers = computeTierThresholds(baseline, posts, Date.now());
		expect(tiers).toMatchObject({ sufficient: true, typicalInteractions: 8, topMin: 16, lowMax: 4 });
		// 1 and 2 are low; the fresh post with 1 interaction is still collecting ('new').
		expect(tiers.counts).toEqual({ top: 2, moderate: 4, low: 2, new: 1 });
		expect(tierOf(posts.find((p) => p.id === 'p6')!, tiers, Date.now())).toBe('top');
	});

	it('does not classify without enough history', () => {
		const rows = [5, 6].map((n, i) => row(`q${i}`, n, 10));
		const baseline = computeBaseline(rows);
		const posts = rows.map((r) => toIntelligencePost(r, 1000, baseline.avgInteractions));
		const tiers = computeTierThresholds(baseline, posts, Date.now());
		expect(tiers.sufficient).toBe(false);
		expect(tierOf(posts[0], tiers, Date.now())).toBeNull();
	});
});

describe('intelligence API', () => {
	const ENDPOINTS: Array<['GET' | 'POST', string]> = [
		['GET', '/api/intelligence/overview'],
		['GET', '/api/intelligence/insights'],
		['GET', '/api/intelligence/media'],
		['GET', '/api/intelligence/media/abc'],
		['GET', '/api/intelligence/media/abc/analysis'],
		['GET', '/api/intelligence/ask'],
		['POST', '/api/intelligence/ask'],
	];

	it.each(ENDPOINTS)('%s %s requires authentication', async (method, path) => {
		const res = await call(method, path, method === 'POST' ? { body: { question: 'hi there' } } : {});
		expect(res.status).toBe(401);
	});

	it('returns overview: null when no account is connected', async () => {
		const { token } = await signUp();
		const res = await call('GET', '/api/intelligence/overview', { token });
		expect(res.status).toBe(200);
		expect((res.body as any).data).toEqual({ accounts: [], overview: null });
	});

	it('stores per-media insights via field expansion and computes the overview from real rows', async () => {
		const { user, calls, secret } = await connect({ igId: 'ig_intel_1', followers: 2000, media: metaMedia(12, { withInsights: true }) });

		// Insights were requested inline on the media edge (no extra request per post).
		const mediaCalls = calls.filter((c) => c.url.includes('/ig_intel_1/media'));
		expect(mediaCalls).toHaveLength(1);
		expect(new URL(mediaCalls[0].url).searchParams.get('fields')).toContain('insights.metric(views,reach,saved,shares,total_interactions)');

		const res = await call('GET', '/api/intelligence/overview?tz=Asia/Kolkata', { token: user.token });
		expect(res.status).toBe(200);
		const { overview } = (res.body as any).data;

		expect(overview.summary.followers).toBe(2000);
		expect(overview.archive.syncedCount).toBe(12);
		// likes (i+1)*10 + comments i, i = 0..11 → (780 + 66) / 12 = 70.5
		expect(overview.baseline.avgInteractions).toBe(70.5);
		// interactions 10, 21, …, 131: middle pair 65 and 76 → median 70.5
		expect(overview.baseline.medianInteractions).toBe(70.5);
		expect(overview.ranking.sufficient).toBe(true);
		expect(overview.ranking.working[0].interactions).toBe(131);
		expect(overview.ranking.working[0].engagementRate).toBe(6.55);
		expect(overview.ranking.attention[0].interactions).toBe(10);

		// Views only exist for the 4 reels that returned insights; everything else stays null.
		expect(overview.archive.viewsAvailableCount).toBe(4);
		const reel = overview.formats.find((f: any) => f.format === 'REEL');
		expect(reel.count).toBe(4);
		expect(reel.viewsSampleSize).toBe(4);
		const posts = overview.formats.find((f: any) => f.format === 'POST');
		expect(posts.avgViews).toBeNull();
		expect(posts.viewsSampleSize).toBe(0);

		expect(overview.timing.sufficient).toBe(false);
		expect(overview.timing.timezone).toBe('Asia/Kolkata');
		expect(overview.definitions.engagementRate).toContain('follower');

		const serialized = JSON.stringify(res.body);
		expect(serialized).not.toContain(secret);
		expect(serialized).not.toContain('cred_');
	});

	it('steps down through insight metric sets when Meta rejects a metric, without failing sync', async () => {
		const { user, calls } = await connect({ igId: 'ig_intel_2', media: metaMedia(3, { withInsights: true }), rejectMetric: 'views' });
		const fields = calls.filter((c) => c.url.includes('/ig_intel_2/media')).map((c) => new URL(c.url).searchParams.get('fields'));
		expect(fields).toHaveLength(2);
		expect(fields[1]).toContain('insights.metric(reach,saved,shares,total_interactions)');

		const res = await call('GET', '/api/intelligence/overview', { token: user.token });
		const { overview } = (res.body as any).data;
		expect(overview.archive.syncedCount).toBe(3);
		expect(overview.ranking.sufficient).toBe(false);
		expect(overview.ranking.working).toEqual([]);
	});

	it('pages, filters and sorts the content library and validates parameters', async () => {
		const { user } = await connect({ igId: 'ig_intel_3', media: metaMedia(12) });

		const page1 = await call('GET', '/api/intelligence/media?limit=5&sort=interactions', { token: user.token });
		const data1 = (page1.body as any).data;
		expect(data1.total).toBe(12);
		expect(data1.items).toHaveLength(5);
		expect(data1.nextOffset).toBe(5);
		expect(data1.items[0].interactions).toBe(131);

		const last = await call('GET', '/api/intelligence/media?limit=5&offset=10', { token: user.token });
		expect((last.body as any).data.nextOffset).toBeNull();

		const reels = await call('GET', '/api/intelligence/media?format=REEL', { token: user.token });
		expect((reels.body as any).data.items.every((p: any) => p.format === 'REEL')).toBe(true);

		const search = await call('GET', `/api/intelligence/media?q=${encodeURIComponent('Caption 11')}`, { token: user.token });
		expect((search.body as any).data.total).toBe(1);

		const below = await call('GET', '/api/intelligence/media?performance=below', { token: user.token });
		expect((below.body as any).data.items.every((p: any) => p.interactions < 70.5)).toBe(true);

		const recent = await call('GET', '/api/intelligence/media?period=30d', { token: user.token });
		expect((recent.body as any).data.total).toBe(12);

		const bad = await call('GET', '/api/intelligence/media?sort=drop_table', { token: user.token });
		expect(bad.status).toBe(400);
	});

	it('returns post detail with measured comparisons and enforces ownership', async () => {
		const owner = await connect({ igId: 'ig_intel_4', media: metaMedia(8) });
		const list = await call('GET', '/api/intelligence/media?sort=interactions&limit=1', { token: owner.user.token });
		const postId = (list.body as any).data.items[0].id;

		const res = await call('GET', `/api/intelligence/media/${postId}?tz=UTC`, { token: owner.user.token });
		expect(res.status).toBe(200);
		const detail = (res.body as any).data;
		// Tiers compare with the typical (median) post: 87 interactions is below 2 × 48.5, so the best post
		// here is moderate — not "top" just because it beats the mean.
		expect(detail.classification).toBe('typical');
		expect(detail.post.tier).toBe('moderate');
		expect(detail.comparison.typicalInteractions).toBe(48.5);
		expect(detail.comparison.accountAvgInteractions).toBe(48.5);
		expect(detail.observedFactors.map((f: any) => f.label)).toEqual(['Format', 'Published', 'Caption length', 'Hashtags', 'Mentions']);

		const other = await signUp();
		installFetchMock({ igId: 'ig_intel_4b', media: [] });
		await call('POST', '/api/accounts/connect', { token: other.token, body: { platform: 'instagram', accessToken: 'EAAB_OTHER' } });
		const stolen = await call('GET', `/api/intelligence/media/${postId}`, { token: other.token });
		expect(stolen.status).toBe(404);
	});

	it('reports AI as unavailable (503) when Gemini is not configured', async () => {
		setGeminiKey(undefined);
		const { user } = await connect({ igId: 'ig_intel_5', media: metaMedia(8) });
		const res = await call('GET', '/api/intelligence/insights', { token: user.token });
		expect(res.status).toBe(503);
		expect(res.body).toMatchObject({ error: { code: 'AI_UNAVAILABLE', message: 'AI analysis is temporarily unavailable.' } });
	});

	it('needs enough history before generating AI insights', async () => {
		setGeminiKey('test-gemini-key');
		const { user } = await connect({ igId: 'ig_intel_6', media: metaMedia(2) });
		const res = await call('GET', '/api/intelligence/insights', { token: user.token });
		expect(res.status).toBe(422);
		expect(res.body).toMatchObject({ error: { code: 'INSUFFICIENT_DATA' } });
	});

	it('sends Gemini only sanitized analytics and rebuilds supporting data from stored numbers', async () => {
		setGeminiKey('test-gemini-key');
		const secret = 'EAAB_GEMINI_MUST_NOT_SEE_THIS';
		let topId = '';
		const media = metaMedia(8);
		const { user, calls } = await connect({
			igId: 'ig_intel_7',
			media,
			gemini: (body) => {
				const prompt: string = body.contents[0].parts[0].text;
				const context = JSON.parse(prompt.slice(prompt.indexOf('{')));
				topId = context.topPosts[0].id;
				return {
					insights: [
						{
							type: 'pattern',
							title: 'Reels lead interactions',
							observation: 'Your top post is a reel.',
							explanation: 'Reels may reach more non-followers.',
							recommendation: 'Publish one more reel this week.',
							expectedMeasurement: 'Compare interactions with the account average.',
							evidencePostIds: [topId, 'invented_id'],
							evidenceFormats: ['REEL', 'NOT_A_FORMAT'],
						},
						{ type: 'timing', title: 'Post at 6pm', observation: 'x', explanation: 'x', recommendation: 'x', expectedMeasurement: 'x', evidencePostIds: [], evidenceFormats: [] },
					],
				};
			},
		}, secret);

		const res = await call('GET', '/api/intelligence/insights', { token: user.token });
		expect(res.status).toBe(200);
		const { insights } = (res.body as any).data;
		// The timing insight is dropped: there is not enough history for timing claims.
		expect(insights).toHaveLength(1);
		expect(insights[0].supportingData.posts.map((p: any) => p.id)).toEqual([topId]);
		expect(insights[0].supportingData.posts[0].likes).toBe(80);
		expect(insights[0].supportingData.formats.map((f: any) => f.format)).toEqual(['REEL']);

		const geminiCalls = calls.filter((c) => c.url.includes('generativelanguage'));
		expect(geminiCalls).toHaveLength(1);
		expect(geminiCalls[0].url).not.toContain('test-gemini-key');
		expect(geminiCalls[0].body).not.toContain(secret);
		expect(geminiCalls[0].body).not.toContain('cred_');
		expect(geminiCalls[0].body).not.toContain(user.email);
		expect(geminiCalls[0].body).not.toContain('instagram.com');

		// Gemini's key travels only in the x-goog-api-key header, never in the URL or body.
		expect(geminiCalls[0].body).not.toContain('test-gemini-key');

		// Second request is served from the per-sync cache (stored in MongoDB).
		await call('GET', '/api/intelligence/insights', { token: user.token });
		expect(calls.filter((c) => c.url.includes('generativelanguage'))).toHaveLength(1);
		expect(await AiCache.countDocuments({ userId: user.userId })).toBe(1);
	});

	it('answers questions from account data and keeps recent questions', async () => {
		setGeminiKey('test-gemini-key');
		const { user } = await connect({
			igId: 'ig_intel_8',
			media: metaMedia(8),
			gemini: () => ({
				answerable: true,
				directAnswer: 'Reels performed best.',
				observation: 'Reels average the most interactions.',
				explanation: 'This may be because reels are shown to non-followers.',
				recommendation: 'Test two reels next week.',
				expectedMeasurement: 'Interactions vs the account average.',
				evidencePostIds: [],
				evidenceFormats: ['REEL'],
			}),
		});

		const invalid = await call('POST', '/api/intelligence/ask', { token: user.token, body: { question: 'a' } });
		expect(invalid.status).toBe(400);

		const res = await call('POST', '/api/intelligence/ask', { token: user.token, body: { question: 'Which format performs best?' } });
		expect(res.status).toBe(200);
		expect((res.body as any).data).toMatchObject({ question: 'Which format performs best?', directAnswer: 'Reels performed best.' });

		const history = await call('GET', '/api/intelligence/ask', { token: user.token });
		expect((history.body as any).data.history).toHaveLength(1);
		expect(await AiQuestion.countDocuments({ userId: user.userId })).toBe(1);
	});

	it('planner returns no windows until there is enough history', async () => {
		const { user } = await connect({ igId: 'ig_intel_9', media: metaMedia(8) });
		const res = await call('GET', '/api/planner/insights?tz=UTC', { token: user.token });
		expect(res.status).toBe(200);
		expect((res.body as any).data).toMatchObject({ sufficient: false, heatmap: [], recommendedWindows: [], minimumRequired: 30 });
	});

	it('filters the content library by tier and reports tiers in the overview', async () => {
		// interactions 10, 21, …, 131 → typical (median) 70.5: top ≥ 141 (none), low ≤ 35.25 (10, 21, 32)
		const { user } = await connect({ igId: 'ig_intel_tiers', media: metaMedia(12) });
		const overview = (await call('GET', '/api/intelligence/overview', { token: user.token })).body.data.overview;
		expect(overview.tiers).toMatchObject({ sufficient: true, typicalInteractions: 70.5, topMin: 141, lowMax: 35.25, counts: { top: 0, moderate: 9, low: 3, new: 0 } });

		const low = (await call('GET', '/api/intelligence/media?tier=low&sort=lowest', { token: user.token })).body.data;
		expect(low.total).toBe(3);
		expect(low.items.map((p: any) => p.interactions)).toEqual([10, 21, 32]);
		expect(low.items.every((p: any) => p.tier === 'low')).toBe(true);
		expect(low.items[0].vsTypicalPercent).toBe(-85.8);

		const moderate = (await call('GET', '/api/intelligence/media?tier=moderate&format=REEL', { token: user.token })).body.data;
		expect(moderate.items.every((p: any) => p.tier === 'moderate' && p.format === 'REEL')).toBe(true);
		expect((await call('GET', '/api/intelligence/media?tier=top', { token: user.token })).body.data.total).toBe(0);
		expect((await call('GET', '/api/intelligence/media?tier=viral', { token: user.token })).status).toBe(400);
	});

	it('planner reports measured windows once history is sufficient', async () => {
		const { user } = await connect({ igId: 'ig_intel_10', media: metaMedia(40) });
		const res = await call('GET', '/api/planner/insights?tz=UTC', { token: user.token });
		const data = (res.body as any).data;
		expect(data.sufficient).toBe(true);
		expect(data.heatmap.length).toBeGreaterThan(0);
		for (const window of data.recommendedWindows) expect(window.rationale).toMatch(/^Averaged [\d.]+ interactions across \d+ posts/);
		expect(data.scheduling).toEqual({ supported: false, reason: expect.stringContaining('Instagram') });
	});

	it('returns a safe 503 when Gemini fails and never caches the failure', async () => {
		setGeminiKey('test-gemini-key');
		const { user, calls } = await connect({ igId: 'ig_intel_11', media: metaMedia(8) });
		// No gemini handler: the mock answers 500.
		const res = await call('GET', '/api/intelligence/insights', { token: user.token });
		expect(res.status).toBe(503);
		expect(res.body).toMatchObject({ error: { code: 'AI_UNAVAILABLE' } });
		expect(await AiCache.countDocuments({ userId: user.userId })).toBe(0);
		expect(calls.filter((c) => c.url.includes('generativelanguage'))).toHaveLength(1);
	});

	it('enforces the per-user hourly AI budget', async () => {
		restoreConfig = overrideConfig({ GEMINI_API_KEY: 'test-gemini-key', AI_REQUESTS_PER_HOUR: 1 });
		const { user } = await connect({
			igId: 'ig_intel_12',
			media: metaMedia(8),
			gemini: () => ({ answerable: true, directAnswer: 'Yes.', observation: 'o', explanation: 'e', recommendation: 'r', expectedMeasurement: 'm', evidencePostIds: [], evidenceFormats: [] }),
		});
		expect((await call('POST', '/api/intelligence/ask', { token: user.token, body: { question: 'First question?' } })).status).toBe(200);
		const limited = await call('POST', '/api/intelligence/ask', { token: user.token, body: { question: 'Second question?' } });
		expect(limited.status).toBe(429);
		expect(limited.body).toMatchObject({ error: { code: 'AI_RATE_LIMITED' } });
	});
});
