import { getConfig } from '../config/env';
import { ConnectedAccountRow, findAccountById, markFullSyncCompleted, updateAccountStatusAndSynced } from '../db/accounts';
import {
	ContentInput,
	createSyncRun,
	findKnownContentIds,
	findReelsNeedingWatchMetrics,
	getAccountInsights,
	getContentByAccountId,
	getLastSyncRun,
	mergeExtraMetrics,
	updateSyncRun,
	upsertAccountInsight,
	upsertContentItems,
} from '../db/content';
import { HttpError } from '../lib/http';
import { redactSecrets } from '../lib/redact';
import type { SyncMode } from '../models';
import { getPlatformCredentials } from './credentials';
import { getMetaApiVersion } from './instagram';
import { classifyFormat, normalizeTimestamp } from './intelligence';

export interface SyncSummary {
	accountId: string;
	postsSynced: number;
	metricsSynced: number;
	lastSyncedAt: string;
	/** partial: what was fetched is stored, but the run stopped early (see `message`). Absent = completed. */
	status?: 'completed' | 'partial';
	mode?: SyncMode;
	/** Posts stored for the first time in this run. */
	newPosts?: number;
	/** Content count the platform's profile reports (may exceed what its API returns). */
	profileMediaCount?: number | null;
	message?: string | null;
}

export interface InstagramDashboardResponse {
	account: {
		id: string;
		platform: ConnectedAccountRow['platform'];
		handle: string;
		displayName: string | null;
		profilePictureUrl: string | null;
		status: 'connected' | 'reauthorization_required' | 'error';
		connectedAt: string;
		lastSyncedAt: string | null;
	};
	metrics: {
		followersCount: number | null;
		followsCount: number | null;
		mediaCount: number | null;
		reach: number | null;
		impressions: number | null;
		engagementRate: number | null;
	};
	posts: Array<{
		id: string;
		providerMediaId: string;
		mediaType: string | null;
		mediaProductType: string | null;
		caption: string | null;
		permalink: string | null;
		mediaUrl: string | null;
		thumbnailUrl: string | null;
		timestamp: string | null;
		likeCount: number | null;
		commentsCount: number | null;
		reach: number | null;
		impressions: number | null;
		engagementRate: number | null;
	}>;
	lastSyncRun: {
		status: 'running' | 'completed' | 'partial' | 'failed';
		startedAt: string;
		completedAt: string | null;
		itemsFetched: number;
		errorMessage: string | null;
	} | null;
}

const DAY_MS = 86_400_000;

const MEDIA_FIELDS =
	'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
const MEDIA_FIELDS_FALLBACK = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

/**
 * Media insight metric sets, richest first. Meta rejects the whole request if any metric is not
 * supported for the Graph API version or for one media item in the page, so sync steps down
 * through these sets and finally requests the page without insights. Metrics that are not
 * returned are stored as null ("not available"), never as zero.
 */
const MEDIA_INSIGHT_METRIC_SETS: readonly string[][] = [
	['views', 'reach', 'saved', 'shares', 'total_interactions'],
	['reach', 'saved', 'shares', 'total_interactions'],
	['reach', 'saved'],
];

/** Reels-only insights (milliseconds). Requested per Reel because feed media reject them. */
const REEL_WATCH_METRICS = ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'] as const;

/** Account-level insights (metric_type=total_value). `impressions` was removed by Meta in April 2025. */
const ACCOUNT_INSIGHT_METRICS = ['reach', 'views', 'accounts_engaged', 'total_interactions'] as const;
const ACCOUNT_INSIGHT_DAYS = 28;

/**
 * Meta throttling codes (app, user, page and Instagram business-use-case limits). A throttled sync
 * stops paging and keeps what it stored; the next run continues.
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008]);

interface MediaInsightsField {
	data?: Array<{ name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>;
}

interface MediaPageResponse {
	data?: Array<{
		id: string;
		caption?: string;
		media_type?: string;
		media_product_type?: string;
		media_url?: string;
		thumbnail_url?: string;
		permalink?: string;
		timestamp?: string;
		like_count?: number;
		comments_count?: number;
		insights?: MediaInsightsField;
	}>;
	paging?: { next?: string };
}

interface MetaFailure {
	status: number;
	code: number | null;
	message: string;
	rateLimited: boolean;
}

type PageResult = { ok: true; data: MediaPageResponse; tier: number } | { ok: false; error: MetaFailure };

async function readFailure(res: Response): Promise<MetaFailure> {
	let code: number | null = null;
	let message = `Meta returned HTTP ${res.status}.`;
	try {
		const body = (await res.json()) as { error?: { code?: number; message?: string } };
		code = typeof body.error?.code === 'number' ? body.error.code : null;
		if (body.error?.message) message = redactSecrets(body.error.message).slice(0, 300);
	} catch {
		// non-JSON error body
	}
	return { status: res.status, code, message, rateLimited: res.status === 429 || (code !== null && RATE_LIMIT_CODES.has(code)) };
}

function mediaFieldsForTier(tier: number): string {
	const metrics = MEDIA_INSIGHT_METRIC_SETS[tier];
	return metrics ? `${MEDIA_FIELDS},insights.metric(${metrics.join(',')})` : MEDIA_FIELDS;
}

/**
 * Requests one media page starting at `startTier` and stepping down when Meta rejects the requested
 * insight metrics. Throttling stops immediately (stepping down would only spend more quota).
 */
async function fetchMediaPage(url: string, startTier: number, fetchImpl: typeof fetch): Promise<PageResult> {
	let lastError: MetaFailure = { status: 0, code: null, message: 'No response from Meta.', rateLimited: false };
	for (let tier = startTier; tier <= MEDIA_INSIGHT_METRIC_SETS.length; tier++) {
		const pageUrl = new URL(url);
		pageUrl.searchParams.set('fields', mediaFieldsForTier(tier));
		const res = await fetchImpl(pageUrl.toString());
		if (res.ok) return { ok: true, data: (await res.json()) as MediaPageResponse, tier };
		lastError = await readFailure(res);
		if (lastError.rateLimited) break;
	}
	return { ok: false, error: lastError };
}

async function fetchPlainPage(url: string, fetchImpl: typeof fetch): Promise<PageResult> {
	const res = await fetchImpl(url);
	return res.ok ? { ok: true, data: (await res.json()) as MediaPageResponse, tier: MEDIA_INSIGHT_METRIC_SETS.length } : { ok: false, error: await readFailure(res) };
}

function metricNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseMediaInsights(field: MediaInsightsField | undefined) {
	if (!field?.data || !Array.isArray(field.data)) return null;
	const values = new Map<string, number | null>();
	for (const metric of field.data) {
		if (!metric.name) continue;
		values.set(metric.name, metricNumber(metric.values?.[0]?.value ?? metric.total_value?.value));
	}
	return {
		views: values.get('views') ?? null,
		reach: values.get('reach') ?? null,
		saves: values.get('saved') ?? null,
		shares: values.get('shares') ?? null,
		totalInteractions: values.get('total_interactions') ?? null,
	};
}

type MediaItem = NonNullable<MediaPageResponse['data']>[number];

export function toContentInput(item: MediaItem): ContentInput {
	return {
		platformContentId: item.id,
		format: classifyFormat(item.media_type ?? null, item.media_product_type ?? null),
		mediaType: item.media_type ?? null,
		mediaProductType: item.media_product_type ?? null,
		caption: item.caption ?? null,
		permalink: item.permalink ?? null,
		mediaUrl: item.media_url ?? null,
		thumbnailUrl: item.thumbnail_url ?? null,
		timestampRaw: item.timestamp ?? null,
		publishedAt: toDate(normalizeTimestamp(item.timestamp ?? null)),
		counts: { likes: item.like_count ?? null, comments: item.comments_count ?? null },
		insights: parseMediaInsights(item.insights),
	};
}

function toDate(iso: string | null): Date | null {
	return iso ? new Date(iso) : null;
}

/** Full when no complete full sync happened within FULL_SYNC_INTERVAL_MS; incremental otherwise. */
export function chooseSyncMode(account: Pick<ConnectedAccountRow, 'last_full_sync_at'>, now: number): SyncMode {
	const last = account.last_full_sync_at;
	return last === null || now - last >= getConfig().FULL_SYNC_INTERVAL_MS ? 'full' : 'incremental';
}

/** Account-level reach/views/engagement over the last 28 days. Unsupported metrics are simply not stored. */
async function syncAccountInsights(
	base: string,
	account: ConnectedAccountRow,
	accessToken: string,
	now: number,
	fetchImpl: typeof fetch,
): Promise<number> {
	const until = Math.floor(now / 1000);
	const since = until - ACCOUNT_INSIGHT_DAYS * 86_400;
	const metricDate = new Date(until * 1000).toISOString().slice(0, 10);
	let stored = 0;
	// One combined request first; if Meta rejects a metric for this account, each metric is retried alone.
	const attempts: string[][] = [[...ACCOUNT_INSIGHT_METRICS], ...ACCOUNT_INSIGHT_METRICS.map((m) => [m])];
	for (const metrics of attempts) {
		const url = `${base}/${account.platform_account_id}/insights?metric=${metrics.join(',')}&metric_type=total_value&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(accessToken)}`;
		const res = await fetchImpl(url);
		if (!res.ok) {
			if ((await readFailure(res)).rateLimited) return stored;
			continue;
		}
		const body = (await res.json()) as { data?: Array<{ name?: string; total_value?: { value?: unknown } }> };
		for (const item of body.data ?? []) {
			const value = metricNumber(item.total_value?.value);
			if (!item.name || value === null) continue;
			await upsertAccountInsight(
				account.id,
				{ metricName: item.name, metricValue: value, period: `days_${ACCOUNT_INSIGHT_DAYS}`, metricDate, providerSource: 'insights_api' },
				now,
			);
			stored++;
		}
		if (metrics.length > 1) return stored;
	}
	return stored;
}

/**
 * Average and total watch time per Reel (one request per Reel). Bounded per sync; Reels that were
 * never measured come first, then recent ones whose values still change.
 */
async function syncReelWatchMetrics(
	base: string,
	account: ConnectedAccountRow,
	accessToken: string,
	now: number,
	fetchImpl: typeof fetch,
): Promise<number> {
	const config = getConfig();
	if (config.REEL_WATCH_METRICS_PER_SYNC === 0) return 0;
	const ids = await findReelsNeedingWatchMetrics(account.id, new Date(now - config.METRICS_REFRESH_DAYS * DAY_MS), config.REEL_WATCH_METRICS_PER_SYNC);
	const updates: Array<{ platformContentId: string; values: Record<string, number | null> }> = [];
	let throttled = false;
	for (let i = 0; i < ids.length && !throttled; i += 5) {
		const results = await Promise.all(
			ids.slice(i, i + 5).map(async (id) => {
				const res = await fetchImpl(`${base}/${id}/insights?metric=${REEL_WATCH_METRICS.join(',')}&access_token=${encodeURIComponent(accessToken)}`);
				if (!res.ok) {
					if ((await readFailure(res)).rateLimited) throttled = true;
					return null;
				}
				const body = (await res.json()) as MediaInsightsField;
				const value = (name: string) => {
					const metric = body.data?.find((m) => m.name === name);
					return metricNumber(metric?.values?.[0]?.value ?? metric?.total_value?.value);
				};
				return { platformContentId: id, values: { avgWatchTimeMs: value('ig_reels_avg_watch_time'), totalWatchTimeMs: value('ig_reels_video_view_total_time') } };
			}),
		);
		for (const result of results) if (result) updates.push(result);
	}
	await mergeExtraMetrics(account.id, updates);
	return updates.filter((u) => u.values.avgWatchTimeMs !== null || u.values.totalWatchTimeMs !== null).length;
}

export async function syncInstagramAccount(
	account: ConnectedAccountRow,
	now = Date.now(),
	fetchImpl: typeof fetch = fetch,
	options: { mode?: SyncMode } = {},
): Promise<SyncSummary> {
	const config = getConfig();
	const accountId = account.id;
	const userId = account.user_id;

	// 1. Credentials are decrypted server-side only.
	const credentials = await getPlatformCredentials(userId, account.token_reference);
	if (!credentials?.accessToken) {
		await updateAccountStatusAndSynced(accountId, 'reauthorization_required', null, now);
		throw new HttpError(400, 'REAUTHORIZATION_REQUIRED', 'Access token expired or revoked. Please reconnect your Instagram account.');
	}

	const accessToken = credentials.accessToken;
	const version = getMetaApiVersion();
	const mode = options.mode ?? chooseSyncMode(account, now);
	const syncRunId = await createSyncRun(accountId, now, mode);

	let postsSynced = 0;
	let newPosts = 0;
	let metricsSynced = 0;
	let pageCount = 0;
	let profileMediaCount: number | null = null;

	try {
		// 2. Profile fields
		let profileUrl = `${config.META_GRAPH_BASE_URL}/${version}/${account.platform_account_id}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count&access_token=${encodeURIComponent(accessToken)}`;
		let profileRes = await fetchImpl(profileUrl);

		if (!profileRes.ok) {
			// Instagram API with Instagram Login
			profileUrl = `${config.INSTAGRAM_GRAPH_BASE_URL}/${version}/me?fields=id,username,name,account_type,media_count&access_token=${encodeURIComponent(accessToken)}`;
			profileRes = await fetchImpl(profileUrl);
		}

		const profileData = (await profileRes.json()) as {
			id?: string;
			username?: string;
			name?: string;
			profile_picture_url?: string;
			followers_count?: number;
			follows_count?: number;
			media_count?: number;
			error?: { message?: string; code?: number };
		};

		if (!profileRes.ok || profileData.error) {
			const isTokenError = profileData.error?.code === 190 || profileRes.status === 400 || profileRes.status === 401;
			if (isTokenError) {
				await updateAccountStatusAndSynced(accountId, 'reauthorization_required', null, now);
				await updateSyncRun(syncRunId, 'failed', 0, now, { code: 'INVALID_TOKEN', message: 'Meta access token expired or revoked.' });
				throw new HttpError(400, 'INVALID_TOKEN', 'Meta rejected this access token. Check the token and required permissions, then try again.');
			}
			const msg = profileData.error?.message ?? 'Failed to fetch Instagram profile data.';
			await updateSyncRun(syncRunId, 'failed', 0, now, { code: 'META_API_ERROR', message: msg });
			throw new HttpError(400, 'META_API_ERROR', msg);
		}

		profileMediaCount = typeof profileData.media_count === 'number' ? profileData.media_count : null;
		for (const [metricName, value] of [
			['followers_count', profileData.followers_count],
			['follows_count', profileData.follows_count],
			['media_count', profileData.media_count],
		] as const) {
			if (typeof value === 'number') {
				await upsertAccountInsight(accountId, { metricName, metricValue: value, providerSource: 'profile' }, now);
				metricsSynced++;
			}
		}

		await updateAccountStatusAndSynced(accountId, 'connected', now, now, {
			accountName: profileData.name ?? account.account_name,
			accountUsername: profileData.username ?? account.account_username,
			profilePictureUrl: profileData.profile_picture_url ?? account.profile_picture_url,
		});

		// 3. Media with cursor pagination. Per-media insights are requested inline through field
		// expansion (no extra request per post); see fetchMediaPage for the fallback chain.
		// Full mode walks every page. Incremental mode stops at the first page that holds only posts
		// that are already stored and older than the metrics refresh window.
		let nextUrl: string | null = `${config.META_GRAPH_BASE_URL}/${version}/${account.platform_account_id}/media?limit=${config.MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(accessToken)}`;
		let insightTier = 0;
		let usingFallbackApi = false;
		let reachedEnd = false;
		let stop: { code: string; message: string; rateLimited: boolean } | null = null;
		const refreshSince = now - config.METRICS_REFRESH_DAYS * DAY_MS;

		while (nextUrl) {
			if (pageCount >= config.MAX_MEDIA_PAGES) {
				stop = { code: 'PAGE_LIMIT', message: `Stopped after ${pageCount} pages (MAX_MEDIA_PAGES). Older posts were not synced in this run.`, rateLimited: false };
				break;
			}
			pageCount++;
			let page: PageResult = usingFallbackApi ? await fetchPlainPage(nextUrl, fetchImpl) : await fetchMediaPage(nextUrl, insightTier, fetchImpl);

			if (!page.ok && pageCount === 1 && !page.error.rateLimited) {
				// Instagram Login API (graph.instagram.com); its paging URLs are followed as-is.
				usingFallbackApi = true;
				page = await fetchPlainPage(
					`${config.INSTAGRAM_GRAPH_BASE_URL}/${version}/me/media?fields=${MEDIA_FIELDS_FALLBACK}&limit=${config.MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(accessToken)}`,
					fetchImpl,
				);
			}

			if (!page.ok) {
				stop = page.error.rateLimited
					? { code: 'RATE_LIMITED', message: 'Instagram rate limit reached. Posts fetched so far are saved; the rest will sync on the next run.', rateLimited: true }
					: { code: 'MEDIA_PAGE_FAILED', message: `Instagram stopped returning media after ${postsSynced} posts: ${page.error.message}`, rateLimited: false };
				break;
			}
			insightTier = page.tier;
			const items = Array.isArray(page.data.data) ? page.data.data : [];
			if (items.length === 0) {
				reachedEnd = true;
				break;
			}

			const known = mode === 'incremental' ? await findKnownContentIds(accountId, items.map((i) => i.id)) : null;
			const inputs = items.map(toContentInput);
			const written = await upsertContentItems(userId, accountId, 'instagram', inputs, now);
			postsSynced += items.length;
			newPosts += written.inserted;
			nextUrl = page.data.paging?.next ?? null;
			if (!nextUrl) reachedEnd = true;

			if (known && inputs.every((i) => known.has(i.platformContentId) && i.publishedAt !== null && i.publishedAt !== undefined && i.publishedAt.getTime() < refreshSince)) {
				break;
			}
		}

		// 4. Reels watch time and account-level insights; both optional and never fatal.
		const base = `${usingFallbackApi ? config.INSTAGRAM_GRAPH_BASE_URL : config.META_GRAPH_BASE_URL}/${version}`;
		if (!stop?.rateLimited) {
			try {
				metricsSynced += await syncReelWatchMetrics(base, account, accessToken, now, fetchImpl);
				metricsSynced += await syncAccountInsights(base, account, accessToken, now, fetchImpl);
			} catch {
				// Insights may be forbidden or unsupported for this account type.
			}
		}

		const status = stop ? 'partial' : 'completed';
		await updateSyncRun(syncRunId, status, postsSynced, now, stop ? { code: stop.code, message: stop.message } : undefined, {
			pagesFetched: pageCount,
			newItems: newPosts,
			reachedEnd,
			profileMediaCount,
		});
		if (mode === 'full' && status === 'completed' && reachedEnd) await markFullSyncCompleted(accountId, now);

		return {
			accountId,
			postsSynced,
			metricsSynced,
			lastSyncedAt: new Date(now).toISOString(),
			status,
			mode,
			newPosts,
			profileMediaCount,
			message: stop?.message ?? null,
		};
	} catch (err) {
		if (err instanceof HttpError) throw err;
		const msg = redactSecrets(err instanceof Error ? err.message : 'Instagram sync failed due to network or server error.');
		await updateSyncRun(syncRunId, 'failed', postsSynced, now, { code: 'SYNC_ERROR', message: msg }, { pagesFetched: pageCount, newItems: newPosts });
		throw new HttpError(500, 'SYNC_FAILED', 'Instagram sync failed due to a network or server error. Please try again.');
	}
}

/** Account metrics and the latest 50 posts (the Home / account screen population). */
export async function fetchAccountDashboard(userId: string, accountId: string): Promise<InstagramDashboardResponse> {
	const account = await findAccountById(accountId);
	if (!account || account.user_id !== userId) {
		throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Connected account not found.');
	}

	const [mediaRows, insightRows, lastSyncRunRow] = await Promise.all([
		getContentByAccountId(accountId),
		getAccountInsights(accountId),
		getLastSyncRun(accountId),
	]);

	const getInsightVal = (name: string): number | null => insightRows.find((i) => i.metric_name === name)?.metric_value ?? null;

	const followersCount = getInsightVal('followers_count');
	const followsCount = getInsightVal('follows_count');
	const mediaCount = getInsightVal('media_count') ?? mediaRows.length;
	const reach = getInsightVal('reach');
	const impressions = getInsightVal('impressions');

	let totalLikes = 0;
	let totalComments = 0;
	let totalEngagedPosts = 0;

	const posts = mediaRows.map((row) => {
		const likes = typeof row.like_count === 'number' ? row.like_count : null;
		const comments = typeof row.comments_count === 'number' ? row.comments_count : null;

		if (likes !== null) totalLikes += likes;
		if (comments !== null) totalComments += comments;
		if (likes !== null || comments !== null) totalEngagedPosts++;

		const postEngagements = (likes ?? 0) + (comments ?? 0);
		const postEngagementRate = followersCount && followersCount > 0 ? Number(((postEngagements / followersCount) * 100).toFixed(2)) : null;

		return {
			id: row.id,
			providerMediaId: row.provider_media_id,
			mediaType: row.media_type,
			mediaProductType: row.media_product_type,
			caption: row.caption ?? row.title,
			permalink: row.permalink,
			mediaUrl: row.media_url,
			thumbnailUrl: row.thumbnail_url,
			timestamp: row.timestamp,
			likeCount: likes,
			commentsCount: comments,
			reach: null, // Only set if explicitly returned by the platform
			impressions: null,
			engagementRate: postEngagementRate,
		};
	});

	let accountEngagementRate: number | null = null;
	if (followersCount && followersCount > 0 && totalEngagedPosts > 0) {
		const avgEngagementsPerPost = (totalLikes + totalComments) / totalEngagedPosts;
		accountEngagementRate = Number(((avgEngagementsPerPost / followersCount) * 100).toFixed(2));
	}

	return {
		account: {
			id: account.id,
			platform: account.platform,
			handle: account.account_username,
			displayName: account.account_name,
			profilePictureUrl: account.profile_picture_url ?? null,
			status: account.status,
			connectedAt: new Date(account.created_at).toISOString(),
			lastSyncedAt: account.last_synced_at ? new Date(account.last_synced_at).toISOString() : null,
		},
		metrics: {
			followersCount,
			followsCount,
			mediaCount: mediaCount > 0 ? mediaCount : null,
			reach,
			impressions,
			engagementRate: accountEngagementRate,
		},
		posts,
		lastSyncRun: lastSyncRunRow
			? {
					status: lastSyncRunRow.status,
					startedAt: new Date(lastSyncRunRow.started_at).toISOString(),
					completedAt: lastSyncRunRow.completed_at ? new Date(lastSyncRunRow.completed_at).toISOString() : null,
					itemsFetched: lastSyncRunRow.items_fetched,
					errorMessage: lastSyncRunRow.error_message,
				}
			: null,
	};
}
