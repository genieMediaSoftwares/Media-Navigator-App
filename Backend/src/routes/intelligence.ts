import { Request, Router } from 'express';

import { ConnectedAccountRow } from '../db/accounts';
import { findContentById, getLastSyncRun, MediaSort, queryContent } from '../db/content';
import { HttpError, ok, queryParam, readJsonObject } from '../lib/http';
import { authOf, requireAuth } from '../middleware/auth';
import { askMediaNavigator, classifyPost, getAskHistory, getExecutiveInsights, getPostAnalysis } from '../services/aiIntelligence';
import { isAiConfigured } from '../services/gemini';
import {
	CONTENT_FORMATS,
	ContentFormat,
	metricDefinitionsFor,
	MIN_POSTS_FOR_RANKING,
	IntelligencePost,
	observedFactors,
	resolveTimeZone,
	tierOf,
	TierThresholds,
	toIntelligencePost,
	vsTypicalPercent,
} from '../services/intelligence';
import { getPerformanceAnalysis, getTrendInterpretation, getVideoAnalysis } from '../services/aiAnalysis';
import {
	computeComparisons,
	computeDashboardSummary,
	computeFrequencyPerformance,
	computeHeatmap,
	computePerformanceTrend,
	explainPost,
	formatName,
	HeatmapMetric,
	needsImprovement,
	SCORE_DEFINITION,
	ScoredPost,
	topPerformers,
} from '../services/analytics';
import { IntelligenceSnapshot, loadIntelligenceSnapshot, resolveAnalyticsAccount, snapshotInsights } from '../services/intelligenceSnapshot';
import { describeSyncStatus } from '../services/syncStatus';
import { platformName } from '../services/platforms';

// Intelligence API. Every number is computed from synced data in MongoDB (services/intelligence.ts);
// AI text comes from services/aiIntelligence.ts and is labelled as interpretation in the app.
// No response includes access tokens or credential references.

export function accountSummary(row: ConnectedAccountRow) {
	return {
		id: row.id,
		platform: row.platform,
		handle: row.account_username,
		displayName: row.account_name,
		profilePictureUrl: row.profile_picture_url ?? null,
		status: row.status,
		lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
	};
}

/** Adds the post's tier and its difference from the typical post (additive fields). */
function withTier(post: IntelligencePost, tiers: TierThresholds, now: number) {
	return { ...post, tier: tierOf(post, tiers, now), vsTypicalPercent: vsTypicalPercent(post, tiers.typicalInteractions) };
}

const TIERS = ['top', 'moderate', 'low'] as const;
type TierFilter = (typeof TIERS)[number];

/** Interaction bounds for a tier filter, matching tierOf(). Returns null when the tier cannot match anything. */
function tierQuery(tier: TierFilter, tiers: TierThresholds, now: number) {
	if (!tiers.sufficient || tiers.topMin === null) return null;
	if (tier === 'top') return { interactionRange: { gte: tiers.topMin }, publishedBefore: null };
	if (tier === 'low') {
		if (tiers.lowMax === null) return null;
		return { interactionRange: { lte: tiers.lowMax }, publishedBefore: new Date(now - 3 * 86_400_000) };
	}
	return { interactionRange: { lt: tiers.topMin, ...(tiers.lowMax !== null && { gt: tiers.lowMax }) }, publishedBefore: null };
}

const HEATMAP_METRICS: HeatmapMetric[] = ['score', 'views', 'likes', 'engagementRate', 'interactions'];

function scoredPost(snapshot: IntelligenceSnapshot, id: string): ScoredPost | null {
	return snapshot.analytics.posts.find((p) => p.id === id) ?? null;
}

/** top for posts at or above the account's typical score, improve below it; null when unscored. */
function analysisKind(post: ScoredPost | null): 'top' | 'improve' | null {
	if (!post || post.score === null) return null;
	return post.score >= 50 ? 'top' : 'improve';
}

function isVideoPost(snapshot: IntelligenceSnapshot, post: ScoredPost): boolean {
	if (post.format === 'REEL' || post.format === 'VIDEO') return true;
	return snapshot.rows.find((r) => r.id === post.id)?.media_type === 'VIDEO';
}

function percentDiff(value: number | null, reference: number | null): number | null {
	if (value === null || reference === null || reference <= 0) return null;
	return Math.round(((value - reference) / reference) * 1000) / 10;
}

function noAccount(): HttpError {
	return new HttpError(404, 'NO_INSTAGRAM_ACCOUNT', 'Connect a social account to use Intelligence.');
}

/** Loads the snapshot for ?accountId= (or the default account); 404 when there is none. */
async function requireSnapshot(req: Request, userId: string, accountId: string | null): Promise<IntelligenceSnapshot> {
	const { account } = await resolveAnalyticsAccount(userId, accountId);
	if (!account) throw noAccount();
	return loadIntelligenceSnapshot(account, resolveTimeZone(queryParam(req, 'tz')), req.now);
}

const SORTS: readonly MediaSort[] = ['recent', 'oldest', 'interactions', 'lowest', 'likes', 'comments', 'views'];
const PERIOD_DAYS: Record<string, number> = { '30d': 30, '90d': 90, '365d': 365 };

async function requirePost(req: Request, userId: string) {
	const snapshot = await requireSnapshot(req, userId, queryParam(req, 'accountId'));
	const row = await findContentById(snapshot.account.id, req.params.id as string);
	if (!row) throw new HttpError(404, 'MEDIA_NOT_FOUND', `This post was not found in your synced ${platformName(snapshot.account.platform)} content.`);
	return { snapshot, post: toIntelligencePost(row, snapshot.profile.followers, snapshot.baseline.avgInteractions) };
}

export function intelligenceRouter(): Router {
	const router = Router();
	router.use(requireAuth);

	/** GET /api/intelligence/overview?accountId=&tz= — the Intelligence home in one request. */
	router.get('/overview', async (req, res) => {
		const { account, accounts } = await resolveAnalyticsAccount(authOf(req).user.id, queryParam(req, 'accountId'));
		if (!account) {
			ok(res, { accounts: accounts.map(accountSummary), overview: null });
			return;
		}
		const snapshot = await loadIntelligenceSnapshot(account, resolveTimeZone(queryParam(req, 'tz')), req.now);
		const lastRun = await getLastSyncRun(account.id);

		ok(res, {
			accounts: accounts.map(accountSummary),
			overview: {
				account: accountSummary(account),
				summary: {
					followers: snapshot.profile.followers,
					following: snapshot.profile.following,
					profileMediaCount: snapshot.profile.mediaCount,
					avgInteractions: snapshot.baseline.avgInteractions,
					avgEngagementRate: snapshot.archive.avgEngagementRate,
					totalViews: snapshot.archive.totalViews,
					viewsAvailableCount: snapshot.archive.viewsAvailableCount,
					reach: snapshot.profile.reach,
					impressions: snapshot.profile.impressions,
				},
				baseline: snapshot.baseline,
				archive: snapshot.archive,
				formats: snapshot.formats,
				ranking: {
					sufficient: snapshot.ranking.sufficient,
					minimumRequired: MIN_POSTS_FOR_RANKING,
					working: snapshot.ranking.working,
					attention: snapshot.ranking.attention,
				},
				tiers: snapshot.tiers,
				timing: {
					timezone: snapshot.timing.timezone,
					sufficient: snapshot.timing.sufficient,
					postsAnalyzed: snapshot.timing.postsAnalyzed,
					minimumRequired: snapshot.timing.minimumRequired,
					strongestWindow: snapshot.timing.windows[0] ?? null,
				},
				lastSyncRun: lastRun
					? {
							status: lastRun.status,
							startedAt: new Date(lastRun.started_at).toISOString(),
							completedAt: lastRun.completed_at ? new Date(lastRun.completed_at).toISOString() : null,
							itemsFetched: lastRun.items_fetched,
							errorMessage: lastRun.error_message,
						}
					: null,
				aiConfigured: isAiConfigured(),
				definitions: metricDefinitionsFor(platformName(account.platform)),
				sync: await describeSyncStatus(account, req.now),
			},
		});
	});

	/** GET /api/intelligence/insights?accountId=&tz= — AI executive insights (cached per sync). */
	router.get('/insights', async (req, res) => {
		const auth = authOf(req);
		const snapshot = await requireSnapshot(req, auth.user.id, queryParam(req, 'accountId'));
		if (!snapshot.ranking.sufficient) {
			throw new HttpError(
				422,
				'INSUFFICIENT_DATA',
				`Not enough historical data yet. AI insights need at least ${MIN_POSTS_FOR_RANKING} synced posts with engagement data.`,
			);
		}
		ok(res, await getExecutiveInsights(auth.user.id, snapshot, req.now));
	});

	/** GET /api/intelligence/media — paginated, filtered content library. */
	router.get('/media', async (req, res) => {
		const snapshot = await requireSnapshot(req, authOf(req).user.id, queryParam(req, 'accountId'));

		const sortParam = queryParam(req, 'sort') ?? 'recent';
		const formatParam = queryParam(req, 'format');
		const performanceParam = queryParam(req, 'performance');
		const periodParam = queryParam(req, 'period');
		const tierParam = queryParam(req, 'tier');
		if (tierParam && !TIERS.includes(tierParam as TierFilter)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported tier.');
		if (!SORTS.includes(sortParam as MediaSort)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported sort.');
		if (formatParam && !CONTENT_FORMATS.includes(formatParam as ContentFormat)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported format.');
		if (performanceParam && performanceParam !== 'above' && performanceParam !== 'below') {
			throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported performance filter.');
		}
		if (periodParam && periodParam !== 'all' && !PERIOD_DAYS[periodParam]) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported period.');

		const limit = Math.min(Math.max(Number(queryParam(req, 'limit') ?? 20) || 20, 1), 50);
		const offset = Math.max(Number(queryParam(req, 'offset') ?? 0) || 0, 0);
		const days = periodParam ? PERIOD_DAYS[periodParam] : undefined;
		const tierFilter = tierParam ? tierQuery(tierParam as TierFilter, snapshot.tiers, req.now) : null;
		if (tierParam && !tierFilter) {
			ok(res, { items: [], total: 0, nextOffset: null });
			return;
		}

		const { rows, total } = await queryContent(snapshot.account.id, {
			...(tierFilter ?? {}),
			search: (queryParam(req, 'q') ?? '').slice(0, 100) || null,
			format: formatParam,
			since: days ? new Date(req.now - days * 86_400_000) : null,
			performance: performanceParam as 'above' | 'below' | null,
			baselineInteractions: snapshot.baseline.avgInteractions,
			sort: sortParam as MediaSort,
			limit,
			offset,
		});

		const items = rows.map((row) => withTier(toIntelligencePost(row, snapshot.profile.followers, snapshot.baseline.avgInteractions), snapshot.tiers, req.now));
		ok(res, { items, total, nextOffset: offset + items.length < total ? offset + items.length : null });
	});

	/** GET /api/intelligence/media/:id — one post with measured baseline comparisons. */
	router.get('/media/:id', async (req, res) => {
		const { snapshot, post } = await requirePost(req, authOf(req).user.id);
		const formatStats = snapshot.formats.find((f) => f.format === post.format) ?? null;
		const formatAvg = formatStats?.avgInteractions ?? null;

		const scored = scoredPost(snapshot, post.id);
		const kind = analysisKind(scored);
		const { recommendation, trends } = snapshotInsights(snapshot);
		const explained = scored && kind ? explainPost(snapshot.analytics, scored, kind, recommendation, trends) : { reasons: [], improvements: [] };

		ok(res, {
			post: withTier(post, snapshot.tiers, req.now),
			account: accountSummary(snapshot.account),
			/** Score, measured reasons and comparisons (services/analytics.ts). Additive. */
			analysis: scored
				? {
						score: scored.score,
						scoreBasis: scored.scoreBasis,
						avgWatchTimeMs: scored.avgWatchTimeMs,
						kind,
						reasons: explained.reasons,
						improvements: explained.improvements,
						comparisons: computeComparisons(snapshot.analytics, scored),
						isVideo: isVideoPost(snapshot, scored),
						scoreDefinition: SCORE_DEFINITION,
					}
				: null,
			classification: snapshot.ranking.sufficient ? classifyPost(snapshot, post) : 'insufficient',
			comparison: {
				accountAvgInteractions: snapshot.baseline.avgInteractions,
				accountAvgEngagementRate: snapshot.archive.avgEngagementRate,
				vsAccountPercent: post.vsBaselinePercent,
				formatAvgInteractions: formatAvg,
				formatPostCount: formatStats?.count ?? 0,
				typicalInteractions: snapshot.tiers.typicalInteractions,
				vsTypicalPercent: vsTypicalPercent(post, snapshot.tiers.typicalInteractions),
				vsFormatPercent:
					post.interactions !== null && formatAvg !== null && formatAvg > 0
						? Math.round(((post.interactions - formatAvg) / formatAvg) * 1000) / 10
						: null,
			},
			observedFactors: observedFactors(post, snapshot.timing.timezone, snapshot.timing.windows).map((fact) =>
				fact.label === 'Format' ? { ...fact, value: formatName(post.format, snapshot.account.platform).one } : fact,
			),
			aiConfigured: isAiConfigured(),
			definitions: metricDefinitionsFor(platformName(snapshot.account.platform)),
		});
	});

	/** GET /api/intelligence/media/:id/analysis — AI interpretation for one post (cached per sync). */
	router.get('/media/:id/analysis', async (req, res) => {
		const auth = authOf(req);
		const { snapshot, post } = await requirePost(req, auth.user.id);
		if (!snapshot.ranking.sufficient) {
			throw new HttpError(422, 'INSUFFICIENT_DATA', 'Not enough historical data yet to compare this post with your account.');
		}
		ok(res, await getPostAnalysis(auth.user.id, snapshot, post, req.now));
	});

	/**
	 * GET /api/intelligence/media/:id/performance-analysis?kind=top|improve — AI "Why it's top" /
	 * "Why it needs improvement", grounded in the measured reasons (and the cover image when available).
	 */
	router.get('/media/:id/performance-analysis', async (req, res) => {
		const auth = authOf(req);
		const { snapshot, post } = await requirePost(req, auth.user.id);
		const scored = scoredPost(snapshot, post.id);
		const requested = queryParam(req, 'kind');
		if (requested && requested !== 'top' && requested !== 'improve') throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported analysis kind.');
		const kind = (requested as 'top' | 'improve' | null) ?? analysisKind(scored);
		if (!scored || !kind) throw new HttpError(422, 'INSUFFICIENT_DATA', 'Not enough historical data yet to compare this post with your account.');
		const { recommendation, trends } = snapshotInsights(snapshot);
		const observed = explainPost(snapshot.analytics, scored, kind, recommendation, trends);
		const comparisons = computeComparisons(snapshot.analytics, scored);
		ok(res, { observed, ai: await getPerformanceAnalysis(auth.user.id, snapshot, scored, kind, observed, comparisons, req.now) });
	});

	/** GET /api/intelligence/media/:id/video-analysis — Deep Video Analysis (Gemini watches the video itself). */
	router.get('/media/:id/video-analysis', async (req, res) => {
		const auth = authOf(req);
		const { snapshot, post } = await requirePost(req, auth.user.id);
		const scored = scoredPost(snapshot, post.id);
		if (!scored || !isVideoPost(snapshot, scored)) throw new HttpError(422, 'NOT_A_VIDEO', 'Deep video analysis is available for Reels and videos only.');
		const comparisons = computeComparisons(snapshot.analytics, scored);
		const observed = {
			metrics: scored.metrics,
			engagementRate: scored.engagementRate,
			score: scored.score,
			avgWatchTimeMs: scored.avgWatchTimeMs,
			comparisons,
		};
		if (!isAiConfigured()) {
			ok(res, { observed, ai: null, aiConfigured: false });
			return;
		}
		ok(res, { observed, ai: await getVideoAnalysis(auth.user.id, snapshot, scored, comparisons, req.now), aiConfigured: true });
	});

	/** GET /api/intelligence/dashboard?accountId=&tz= — overview totals, trends over time and the next actions. */
	router.get('/dashboard', async (req, res) => {
		const { account, accounts } = await resolveAnalyticsAccount(authOf(req).user.id, queryParam(req, 'accountId'));
		if (!account) {
			ok(res, { accounts: accounts.map(accountSummary), dashboard: null });
			return;
		}
		const snapshot = await loadIntelligenceSnapshot(account, resolveTimeZone(queryParam(req, 'tz')), req.now);
		const { recommendation, tasks } = snapshotInsights(snapshot);
		const summary = computeDashboardSummary(snapshot.analytics);
		ok(res, {
			accounts: accounts.map(accountSummary),
			dashboard: {
				account: accountSummary(account),
				followers: snapshot.profile.followers,
				sync: await describeSyncStatus(account, req.now),
				summary: { ...summary, bestPost: summary.bestPost ? withTier(summary.bestPost, snapshot.tiers, req.now) : null },
				trend: computePerformanceTrend(snapshot.analytics),
				frequency: computeFrequencyPerformance(snapshot.analytics),
				recommendation,
				tasks: tasks.slice(0, 3),
				accountInsights: { reach: snapshot.profile.reach, views: snapshot.profile.views, accountsEngaged: snapshot.profile.accountsEngaged },
				scoreDefinition: SCORE_DEFINITION,
				definitions: metricDefinitionsFor(platformName(account.platform)),
				aiConfigured: isAiConfigured(),
			},
		});
	});

	/** GET /api/intelligence/timing?accountId=&tz= — heat maps per metric and the measured posting recommendation. */
	router.get('/timing', async (req, res) => {
		const snapshot = await requireSnapshot(req, authOf(req).user.id, queryParam(req, 'accountId'));
		const { recommendation } = snapshotInsights(snapshot);
		ok(res, {
			account: accountSummary(snapshot.account),
			recommendation,
			heatmaps: Object.fromEntries(HEATMAP_METRICS.map((metric) => [metric, computeHeatmap(snapshot.analytics, metric)])),
		});
	});

	/** GET /api/intelligence/performers?type=top|improve&format=&limit=&offset= — scored posts with their measured reasons. */
	router.get('/performers', async (req, res) => {
		const snapshot = await requireSnapshot(req, authOf(req).user.id, queryParam(req, 'accountId'));
		const type = queryParam(req, 'type') ?? 'top';
		if (type !== 'top' && type !== 'improve') throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported performer type.');
		const formatParam = queryParam(req, 'format');
		if (formatParam && !CONTENT_FORMATS.includes(formatParam as ContentFormat)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported format.');
		const limit = Math.min(Math.max(Number(queryParam(req, 'limit') ?? 10) || 10, 1), 30);
		const offset = Math.max(Number(queryParam(req, 'offset') ?? 0) || 0, 0);

		const sufficient = snapshot.baseline.sampleSize >= MIN_POSTS_FOR_RANKING;
		const ranked = (type === 'top' ? topPerformers(snapshot.analytics) : needsImprovement(snapshot.analytics)).filter(
			(p) => !formatParam || p.format === formatParam,
		);
		const { recommendation, trends } = snapshotInsights(snapshot);
		const kind = type === 'top' ? 'top' : 'improve';
		const account = computeDashboardSummary(snapshot.analytics);
		const items = sufficient
			? ranked.slice(offset, offset + limit).map((post) => {
					const explained = explainPost(snapshot.analytics, post, kind, recommendation, trends);
					return {
						post: withTier(post, snapshot.tiers, req.now),
						reasons: explained.reasons,
						improvements: explained.improvements,
						vsAccount: {
							// Against the typical (median) post, the same benchmark the reasons use.
							viewsPercent: percentDiff(post.metrics.views, account.views.median),
							likesPercent: percentDiff(post.metrics.likes, account.likes.median),
							engagementRatePercent: percentDiff(post.engagementRate, account.engagementRate.median),
							scorePoints: post.score === null ? null : post.score - 50,
						},
						isVideo: isVideoPost(snapshot, post),
					};
				})
			: [];
		ok(res, {
			type,
			sufficient,
			minimumRequired: MIN_POSTS_FOR_RANKING,
			total: sufficient ? ranked.length : 0,
			items,
			nextOffset: sufficient && offset + items.length < ranked.length ? offset + items.length : null,
			/** The typical (median) post the comparisons above are measured against. */
			typicalPost: { views: account.views.median, likes: account.likes.median, engagementRate: account.engagementRate.median },
			scoreDefinition: SCORE_DEFINITION,
			aiConfigured: isAiConfigured(),
		});
	});

	/** GET /api/intelligence/trends?accountId=&tz= — patterns detected across the full history, and prioritized tasks. */
	router.get('/trends', async (req, res) => {
		const snapshot = await requireSnapshot(req, authOf(req).user.id, queryParam(req, 'accountId'));
		const { recommendation, trends, tasks } = snapshotInsights(snapshot);
		ok(res, { account: accountSummary(snapshot.account), ...trends, tasks, recommendation, aiConfigured: isAiConfigured() });
	});

	/** GET /api/intelligence/trends/ai — AI interpretation of the detected trends (cached per sync). */
	router.get('/trends/ai', async (req, res) => {
		const auth = authOf(req);
		const snapshot = await requireSnapshot(req, auth.user.id, queryParam(req, 'accountId'));
		const { trends } = snapshotInsights(snapshot);
		if (!trends.sufficient || trends.trends.length === 0) {
			throw new HttpError(422, 'INSUFFICIENT_DATA', `AI trends need clear patterns in at least ${trends.minimumRequired} synced posts.`);
		}
		ok(res, await getTrendInterpretation(auth.user.id, snapshot, trends, req.now));
	});

	/** GET /api/intelligence/ask?accountId= — recent questions and their answers. */
	router.get('/ask', async (req, res) => {
		const auth = authOf(req);
		const { account } = await resolveAnalyticsAccount(auth.user.id, queryParam(req, 'accountId'));
		if (!account) throw noAccount();
		ok(res, { history: await getAskHistory(auth.user.id, account.id), aiConfigured: isAiConfigured() });
	});

	/** POST /api/intelligence/ask { accountId?, question, tz? } — answer from the account's real data. */
	router.post('/ask', async (req, res) => {
		const auth = authOf(req);
		const body = readJsonObject(req);
		const question = typeof body.question === 'string' ? body.question.trim() : '';
		if (question.length < 3 || question.length > 500) {
			throw new HttpError(400, 'VALIDATION_ERROR', 'Ask a question between 3 and 500 characters.', {
				question: 'Ask a question between 3 and 500 characters.',
			});
		}
		const accountId = typeof body.accountId === 'string' && body.accountId.trim() !== '' ? body.accountId.trim() : null;
		const { account } = await resolveAnalyticsAccount(auth.user.id, accountId);
		if (!account) throw noAccount();

		const snapshot = await loadIntelligenceSnapshot(account, resolveTimeZone(typeof body.tz === 'string' ? body.tz : null), req.now);
		if (snapshot.posts.length === 0) {
			throw new HttpError(422, 'INSUFFICIENT_DATA', `No ${platformName(account.platform)} content has been synchronized yet.`);
		}
		ok(res, await askMediaNavigator(auth.user.id, snapshot, question, req.now));
	});

	return router;
}
