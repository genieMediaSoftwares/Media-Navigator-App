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
import { IntelligenceSnapshot, loadIntelligenceSnapshot, resolveAnalyticsAccount } from '../services/intelligenceSnapshot';
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

		ok(res, {
			post: withTier(post, snapshot.tiers, req.now),
			account: accountSummary(snapshot.account),
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
			observedFactors: observedFactors(post, snapshot.timing.timezone, snapshot.timing.windows),
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
