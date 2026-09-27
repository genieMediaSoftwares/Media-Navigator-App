import { ConnectedAccountRow } from '../db/accounts';
import { findInstagramMediaById, getLastSyncRunByAccountId, MediaSort, queryInstagramMedia } from '../db/instagramData';
import { HttpError, ok, readJsonObject } from '../lib/http';
import { RequestContext } from '../lib/router';
import { withAuth } from '../middleware/auth';
import { askMediaNavigator, classifyPost, getAskHistory, getExecutiveInsights, getPostAnalysis } from '../services/aiIntelligence';
import { isAiConfigured } from '../services/gemini';
import {
	CONTENT_FORMATS,
	ContentFormat,
	METRIC_DEFINITIONS,
	MIN_POSTS_FOR_RANKING,
	observedFactors,
	resolveTimeZone,
	toIntelligencePost,
} from '../services/intelligence';
import { IntelligenceSnapshot, loadIntelligenceSnapshot, resolveInstagramAccount } from '../services/intelligenceSnapshot';

// Intelligence API. Every number is computed from synced D1 data (services/intelligence.ts);
// AI text comes from services/aiIntelligence.ts and is labelled as interpretation in the app.
// No response includes access tokens or credential references.

function accountSummary(row: ConnectedAccountRow) {
	return {
		id: row.id,
		platform: row.platform as 'instagram' | 'youtube' | 'linkedin' | 'facebook',
		handle: row.account_username,
		displayName: row.account_name,
		profilePictureUrl: row.profile_picture_url ?? null,
		status: row.status,
		lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
	};
}

function queryParam(context: RequestContext, name: string): string | null {
	const value = context.url.searchParams.get(name);
	return value && value.trim() !== '' ? value.trim() : null;
}

/** Loads the snapshot for ?accountId= (or the first Instagram account); 404 when there is none. */
async function requireSnapshot(context: RequestContext, userId: string, accountId: string | null): Promise<IntelligenceSnapshot> {
	const { account } = await resolveInstagramAccount(context.env.DB, userId, accountId);
	if (!account) throw new HttpError(404, 'NO_INSTAGRAM_ACCOUNT', 'Connect an Instagram account to use Intelligence.');
	return loadIntelligenceSnapshot(context.env, account, resolveTimeZone(queryParam(context, 'tz')), context.now);
}

/** GET /api/intelligence/overview?accountId=&tz= — the Intelligence home in one request. */
export const intelligenceOverview = withAuth(async (context, auth) => {
	const { account, accounts } = await resolveInstagramAccount(context.env.DB, auth.user.id, queryParam(context, 'accountId'));
	if (!account) return ok({ accounts: accounts.map(accountSummary), overview: null });

	const snapshot = await loadIntelligenceSnapshot(context.env, account, resolveTimeZone(queryParam(context, 'tz')), context.now);
	const lastRun = await getLastSyncRunByAccountId(context.env.DB, account.id);

	return ok({
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
			aiConfigured: isAiConfigured(context.env),
			definitions: METRIC_DEFINITIONS,
		},
	});
});

/** GET /api/intelligence/insights?accountId=&tz= — AI executive insights (cached per sync). */
export const intelligenceInsights = withAuth(async (context, auth) => {
	const snapshot = await requireSnapshot(context, auth.user.id, queryParam(context, 'accountId'));
	if (!snapshot.ranking.sufficient) {
		throw new HttpError(
			422,
			'INSUFFICIENT_DATA',
			`Not enough historical data yet. AI insights need at least ${MIN_POSTS_FOR_RANKING} synced posts with engagement data.`,
		);
	}
	return ok(await getExecutiveInsights(context.env, auth.user.id, snapshot, context.now));
});

const SORTS: readonly MediaSort[] = ['recent', 'oldest', 'interactions', 'likes', 'comments', 'views'];
const PERIOD_DAYS: Record<string, number> = { '30d': 30, '90d': 90, '365d': 365 };

/** GET /api/intelligence/media — paginated, filtered content library. */
export const intelligenceMedia = withAuth(async (context, auth) => {
	const snapshot = await requireSnapshot(context, auth.user.id, queryParam(context, 'accountId'));

	const sortParam = queryParam(context, 'sort') ?? 'recent';
	const formatParam = queryParam(context, 'format');
	const performanceParam = queryParam(context, 'performance');
	const periodParam = queryParam(context, 'period');
	if (!SORTS.includes(sortParam as MediaSort)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported sort.');
	if (formatParam && !CONTENT_FORMATS.includes(formatParam as ContentFormat)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported format.');
	if (performanceParam && performanceParam !== 'above' && performanceParam !== 'below') {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported performance filter.');
	}
	if (periodParam && periodParam !== 'all' && !PERIOD_DAYS[periodParam]) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported period.');

	const limit = Math.min(Math.max(Number(queryParam(context, 'limit') ?? 20) || 20, 1), 50);
	const offset = Math.max(Number(queryParam(context, 'offset') ?? 0) || 0, 0);
	const days = periodParam ? PERIOD_DAYS[periodParam] : undefined;

	const { rows, total } = await queryInstagramMedia(context.env.DB, snapshot.account.id, {
		search: (queryParam(context, 'q') ?? '').slice(0, 100) || null,
		format: formatParam,
		// Stored timestamps look like 2026-09-25T10:00:00+0000; the first 19 chars compare correctly as text.
		since: days ? new Date(context.now - days * 86_400_000).toISOString().slice(0, 19) : null,
		performance: performanceParam as 'above' | 'below' | null,
		baselineInteractions: snapshot.baseline.avgInteractions,
		sort: sortParam as MediaSort,
		limit,
		offset,
	});

	const items = rows.map((row) => toIntelligencePost(row, snapshot.profile.followers, snapshot.baseline.avgInteractions));
	return ok({ items, total, nextOffset: offset + items.length < total ? offset + items.length : null });
});

async function requirePost(context: RequestContext, userId: string) {
	const snapshot = await requireSnapshot(context, userId, queryParam(context, 'accountId'));
	const id = context.params?.id ?? '';
	const row = await findInstagramMediaById(context.env.DB, snapshot.account.id, id);
	if (!row) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'This post was not found in your synced Instagram media.');
	return { snapshot, post: toIntelligencePost(row, snapshot.profile.followers, snapshot.baseline.avgInteractions) };
}

/** GET /api/intelligence/media/:id — one post with measured baseline comparisons. */
export const intelligencePost = withAuth(async (context, auth) => {
	const { snapshot, post } = await requirePost(context, auth.user.id);
	const formatStats = snapshot.formats.find((f) => f.format === post.format) ?? null;
	const formatAvg = formatStats?.avgInteractions ?? null;

	return ok({
		post,
		account: accountSummary(snapshot.account),
		classification: snapshot.ranking.sufficient ? classifyPost(snapshot, post) : 'insufficient',
		comparison: {
			accountAvgInteractions: snapshot.baseline.avgInteractions,
			accountAvgEngagementRate: snapshot.archive.avgEngagementRate,
			vsAccountPercent: post.vsBaselinePercent,
			formatAvgInteractions: formatAvg,
			formatPostCount: formatStats?.count ?? 0,
			vsFormatPercent:
				post.interactions !== null && formatAvg !== null && formatAvg > 0
					? Math.round(((post.interactions - formatAvg) / formatAvg) * 1000) / 10
					: null,
		},
		observedFactors: observedFactors(post, snapshot.timing.timezone),
		aiConfigured: isAiConfigured(context.env),
		definitions: METRIC_DEFINITIONS,
	});
});

/** GET /api/intelligence/media/:id/analysis — AI interpretation for one post (cached per sync). */
export const intelligencePostAnalysis = withAuth(async (context, auth) => {
	const { snapshot, post } = await requirePost(context, auth.user.id);
	if (!snapshot.ranking.sufficient) {
		throw new HttpError(422, 'INSUFFICIENT_DATA', 'Not enough historical data yet to compare this post with your account.');
	}
	return ok(await getPostAnalysis(context.env, auth.user.id, snapshot, post, context.now));
});

/** GET /api/intelligence/ask?accountId= — recent questions and their answers. */
export const intelligenceAskHistory = withAuth(async (context, auth) => {
	const { account } = await resolveInstagramAccount(context.env.DB, auth.user.id, queryParam(context, 'accountId'));
	if (!account) throw new HttpError(404, 'NO_INSTAGRAM_ACCOUNT', 'Connect an Instagram account to use Intelligence.');
	return ok({ history: await getAskHistory(context.env, auth.user.id, account.id), aiConfigured: isAiConfigured(context.env) });
});

/** POST /api/intelligence/ask { accountId?, question, tz? } — answer from the account's real data. */
export const intelligenceAsk = withAuth(async (context, auth) => {
	const body = await readJsonObject(context.request);
	const question = typeof body.question === 'string' ? body.question.trim() : '';
	if (question.length < 3 || question.length > 500) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Ask a question between 3 and 500 characters.', {
			question: 'Ask a question between 3 and 500 characters.',
		});
	}
	const accountId = typeof body.accountId === 'string' && body.accountId.trim() !== '' ? body.accountId.trim() : null;
	const { account } = await resolveInstagramAccount(context.env.DB, auth.user.id, accountId);
	if (!account) throw new HttpError(404, 'NO_INSTAGRAM_ACCOUNT', 'Connect an Instagram account to use Intelligence.');

	const timeZone = resolveTimeZone(typeof body.tz === 'string' ? body.tz : null);
	const snapshot = await loadIntelligenceSnapshot(context.env, account, timeZone, context.now);
	if (snapshot.posts.length === 0) {
		throw new HttpError(422, 'INSUFFICIENT_DATA', 'No Instagram media has been synchronized yet.');
	}
	return ok(await askMediaNavigator(context.env, auth.user.id, snapshot, question, context.now));
});
