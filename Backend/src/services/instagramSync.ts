import { getConfig } from '../config/env';
import { ConnectedAccountRow, findAccountById, updateAccountStatusAndSynced } from '../db/accounts';
import {
	ContentInput,
	createSyncRun,
	getAccountInsights,
	getContentByAccountId,
	getLastSyncRun,
	updateSyncRun,
	upsertAccountInsight,
	upsertContentItems,
} from '../db/content';
import { HttpError } from '../lib/http';
import { redactSecrets } from '../lib/redact';
import { getPlatformCredentials } from './credentials';
import { getMetaApiVersion } from './instagram';
import { classifyFormat, normalizeTimestamp } from './intelligence';

export interface SyncSummary {
	accountId: string;
	postsSynced: number;
	metricsSynced: number;
	lastSyncedAt: string;
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
		status: 'running' | 'completed' | 'failed';
		startedAt: string;
		completedAt: string | null;
		itemsFetched: number;
		errorMessage: string | null;
	} | null;
}

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

function mediaFieldsForTier(tier: number): string {
	const metrics = MEDIA_INSIGHT_METRIC_SETS[tier];
	return metrics ? `${MEDIA_FIELDS},insights.metric(${metrics.join(',')})` : MEDIA_FIELDS;
}

/**
 * Requests one media page starting at `startTier` and stepping down on failure. Returns the
 * tier that succeeded so later pages start there, or null if even the plain request failed.
 */
async function fetchMediaPage(url: string, startTier: number, fetchImpl: typeof fetch): Promise<{ data: MediaPageResponse; tier: number } | null> {
	for (let tier = startTier; tier <= MEDIA_INSIGHT_METRIC_SETS.length; tier++) {
		const pageUrl = new URL(url);
		pageUrl.searchParams.set('fields', mediaFieldsForTier(tier));
		const res = await fetchImpl(pageUrl.toString());
		if (res.ok) return { data: (await res.json()) as MediaPageResponse, tier };
	}
	return null;
}

async function fetchPlainPage(url: string, fetchImpl: typeof fetch): Promise<{ data: MediaPageResponse; tier: number } | null> {
	const res = await fetchImpl(url);
	return res.ok ? { data: (await res.json()) as MediaPageResponse, tier: MEDIA_INSIGHT_METRIC_SETS.length } : null;
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

export async function syncInstagramAccount(
	account: ConnectedAccountRow,
	now = Date.now(),
	fetchImpl: typeof fetch = fetch,
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
	const syncRunId = await createSyncRun(accountId, now);

	let postsSynced = 0;
	let metricsSynced = 0;

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

		// 3. Account-level insights where supported (impressions, reach)
		try {
			const insightsUrl = `${config.META_GRAPH_BASE_URL}/${version}/${account.platform_account_id}/insights?metric=impressions,reach&period=day&access_token=${encodeURIComponent(accessToken)}`;
			const insightsRes = await fetchImpl(insightsUrl);
			if (insightsRes.ok) {
				const insightsData = (await insightsRes.json()) as {
					data?: Array<{ name: string; period: string; values: Array<{ value: number; end_time?: string }> }>;
				};
				for (const item of insightsData.data ?? []) {
					const lastVal = item.values[item.values.length - 1];
					if (lastVal && typeof lastVal.value === 'number') {
						await upsertAccountInsight(
							accountId,
							{
								metricName: item.name,
								metricValue: lastVal.value,
								period: item.period,
								metricDate: lastVal.end_time ?? 'latest',
								providerSource: 'insights_api',
							},
							now,
						);
						metricsSynced++;
					}
				}
			}
		} catch {
			// Account-level insights may be forbidden or unsupported for this account type.
		}

		// 4. Media with cursor pagination. Per-media insights are requested inline through field
		// expansion (no extra request per post); see fetchMediaPage for the fallback chain.
		let nextUrl: string | null = `${config.META_GRAPH_BASE_URL}/${version}/${account.platform_account_id}/media?limit=${config.MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(accessToken)}`;
		let pageCount = 0;
		let insightTier = 0;
		let usingFallbackApi = false;

		while (nextUrl && pageCount < config.MAX_MEDIA_PAGES) {
			pageCount++;
			let page: { data: MediaPageResponse; tier: number } | null = usingFallbackApi
				? await fetchPlainPage(nextUrl, fetchImpl)
				: await fetchMediaPage(nextUrl, insightTier, fetchImpl);

			if (!page && pageCount === 1) {
				// Instagram Login API (graph.instagram.com); its paging URLs are followed as-is.
				usingFallbackApi = true;
				page = await fetchPlainPage(
					`${config.INSTAGRAM_GRAPH_BASE_URL}/${version}/me/media?fields=${MEDIA_FIELDS_FALLBACK}&limit=${config.MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(accessToken)}`,
					fetchImpl,
				);
			}

			if (!page) break;
			insightTier = page.tier;
			const mediaData: MediaPageResponse = page.data;
			if (!Array.isArray(mediaData.data) || mediaData.data.length === 0) break;

			await upsertContentItems(userId, accountId, 'instagram', mediaData.data.map(toContentInput), now);
			postsSynced += mediaData.data.length;
			nextUrl = mediaData.paging?.next ?? null;
		}

		await updateSyncRun(syncRunId, 'completed', postsSynced, now);
		return { accountId, postsSynced, metricsSynced, lastSyncedAt: new Date(now).toISOString() };
	} catch (err) {
		if (err instanceof HttpError) throw err;
		const msg = redactSecrets(err instanceof Error ? err.message : 'Instagram sync failed due to network or server error.');
		await updateSyncRun(syncRunId, 'failed', postsSynced, now, { code: 'SYNC_ERROR', message: msg });
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
