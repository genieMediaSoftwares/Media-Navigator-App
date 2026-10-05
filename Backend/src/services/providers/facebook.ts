import { getConfig } from '../../config/env';
import { ContentInput } from '../../db/content';
import { HttpError } from '../../lib/http';
import { ContentFormat } from '../../models';
import { exchangeMetaCode, getMetaApiVersion } from '../instagram';
import { metricNumber, requestJson } from './http';
import { PulledData, runProviderSync } from './runSync';
import { ConnectOption, ProviderApiError, SocialProvider } from './types';

// Facebook Pages through the Meta Graph API. The user authorizes with Facebook Login; the server keeps
// the Page access token for the Page the user selects (Page tokens derived from a long-lived user token
// do not expire). Reactions are stored as `likes`; a metric Meta does not return stays null.

const SCOPES = ['pages_show_list', 'pages_read_engagement', 'read_insights'];
const POST_FIELDS =
	'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type,type},reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares';
/** Post insight metric sets, richest first (Meta rejects the whole page if one metric is unsupported). */
const POST_INSIGHT_SETS: readonly string[][] = [['post_impressions_unique']];

const graph = (path: string) => `${getConfig().META_GRAPH_BASE_URL}/${getMetaApiVersion()}/${path}`;

interface PagesResponse {
	data?: Array<{ id: string; name?: string; username?: string; access_token?: string; picture?: { data?: { url?: string } } }>;
	paging?: { next?: string };
}

async function listPages(userToken: string, fetchImpl: typeof fetch): Promise<ConnectOption[]> {
	const options: ConnectOption[] = [];
	let url: string | null = `${graph('me/accounts')}?fields=id,name,username,access_token,picture{url}&limit=100&access_token=${encodeURIComponent(userToken)}`;
	for (let page = 0; url && page < 5; page++) {
		const res: PagesResponse = await requestJson<PagesResponse>(url, { fetchImpl, authStatuses: [400, 401] });
		for (const p of res.data ?? []) {
			if (!p.id || !p.access_token) continue;
			options.push({
				platformAccountId: p.id,
				accountName: p.name ?? null,
				accountUsername: p.username ?? p.name ?? p.id,
				profilePictureUrl: p.picture?.data?.url ?? null,
				credentials: { accessToken: p.access_token },
			});
		}
		url = res.paging?.next ?? null;
	}
	if (options.length === 0) {
		throw new HttpError(400, 'ELIGIBILITY_ERROR', 'No Facebook Pages were found for this login. You need a Page role (and to grant access to the Page) to connect it.');
	}
	return options;
}

export function classifyFacebookPost(post: { status_type?: string; attachments?: { data?: Array<{ media_type?: string; type?: string }> } }): ContentFormat {
	const attachment = post.attachments?.data?.[0];
	const mediaType = attachment?.media_type?.toLowerCase();
	const type = attachment?.type?.toLowerCase() ?? '';
	if (mediaType === 'album' || type === 'album') return 'CAROUSEL';
	if (type.includes('reel')) return 'REEL';
	if (mediaType === 'video' || post.status_type === 'added_video') return 'VIDEO';
	return 'POST';
}

interface PostsResponse {
	data?: Array<{
		id: string;
		message?: string;
		created_time?: string;
		permalink_url?: string;
		full_picture?: string;
		status_type?: string;
		attachments?: { data?: Array<{ media_type?: string; type?: string }> };
		reactions?: { summary?: { total_count?: number } };
		comments?: { summary?: { total_count?: number } };
		shares?: { count?: number };
		insights?: { data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }> };
	}>;
	paging?: { next?: string };
}

function normalizeMetaTime(raw: string | undefined): Date | null {
	if (!raw) return null;
	const date = new Date(raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
	return Number.isNaN(date.getTime()) ? null : date;
}

function toContent(post: NonNullable<PostsResponse['data']>[number]): ContentInput {
	const insightValue = (name: string) => metricNumber(post.insights?.data?.find((m) => m.name === name)?.values?.[0]?.value);
	return {
		platformContentId: post.id,
		format: classifyFacebookPost(post),
		mediaType: post.attachments?.data?.[0]?.media_type ?? null,
		mediaProductType: post.status_type ?? null,
		caption: post.message ?? null,
		permalink: post.permalink_url ?? null,
		mediaUrl: post.full_picture ?? null,
		thumbnailUrl: post.full_picture ?? null,
		timestampRaw: post.created_time ?? null,
		publishedAt: normalizeMetaTime(post.created_time),
		counts: {
			likes: metricNumber(post.reactions?.summary?.total_count),
			comments: metricNumber(post.comments?.summary?.total_count),
			// Meta omits `shares` both when a post has none and when it is unavailable, so absence stays null.
			shares: metricNumber(post.shares?.count),
		},
		insights: post.insights ? { reach: insightValue('post_impressions_unique') } : null,
	};
}

async function pullPage(pageId: string, pageToken: string, fetchImpl: typeof fetch): Promise<PulledData> {
	const config = getConfig();
	const token = encodeURIComponent(pageToken);
	const page = await requestJson<{
		id: string;
		name?: string;
		username?: string;
		followers_count?: number;
		fan_count?: number;
		picture?: { data?: { url?: string } };
	}>(`${graph(pageId)}?fields=id,name,username,followers_count,fan_count,picture{url}&access_token=${token}`, {
		fetchImpl,
		authStatuses: [400, 401],
	});

	const content: ContentInput[] = [];
	let tier = 0;
	let next: string | null = `${graph(`${pageId}/published_posts`)}?limit=${config.FACEBOOK_POSTS_PAGE_SIZE}&access_token=${token}`;
	for (let pageCount = 0; next && pageCount < config.FACEBOOK_MAX_POST_PAGES; pageCount++) {
		let response: PostsResponse | null = null;
		for (; tier <= POST_INSIGHT_SETS.length && !response; tier++) {
			const url: URL = new URL(next);
			const metrics = POST_INSIGHT_SETS[tier];
			url.searchParams.set('fields', metrics ? `${POST_FIELDS},insights.metric(${metrics.join(',')})` : POST_FIELDS);
			try {
				response = await requestJson<PostsResponse>(url.toString(), { fetchImpl });
			} catch (error) {
				// Only an unsupported-metric error steps down; the plain request's failure is final.
				if (!(error instanceof ProviderApiError) || tier === POST_INSIGHT_SETS.length) throw error;
			}
		}
		tier = Math.max(0, tier - 1);
		if (!response?.data?.length) break;
		content.push(...response.data.map(toContent));
		next = response.paging?.next ?? null;
	}

	const accountInsights: PulledData['accountInsights'] = [];
	try {
		const insights = await requestJson<{ data?: Array<{ name: string; period: string; values: Array<{ value: unknown; end_time?: string }> }> }>(
			`${graph(`${pageId}/insights`)}?metric=page_impressions_unique&period=day&access_token=${token}`,
			{ fetchImpl },
		);
		for (const metric of insights.data ?? []) {
			const last = metric.values[metric.values.length - 1];
			const value = metricNumber(last?.value);
			if (value !== null) {
				accountInsights.push({ metricName: 'reach', metricValue: value, period: metric.period, metricDate: last?.end_time ?? 'latest' });
			}
		}
	} catch {
		// Page insights need read_insights and enough Page likes; unavailable values stay absent.
	}

	return {
		profile: {
			accountName: page.name ?? null,
			accountUsername: page.username ?? page.name ?? null,
			profilePictureUrl: page.picture?.data?.url ?? null,
			followers: metricNumber(page.followers_count ?? page.fan_count),
			following: null,
			mediaCount: null,
		},
		accountInsights,
		content,
	};
}

export const facebookProvider: SocialProvider = {
	platform: 'facebook',
	usesPkce: false,
	isConfigured() {
		return this.missingConfiguration().length === 0;
	},
	missingConfiguration() {
		const config = getConfig();
		return (['META_APP_ID', 'META_APP_SECRET', 'FACEBOOK_REDIRECT_URI'] as const).filter((key) => !config[key]);
	},
	authorizationUrl(state) {
		const config = getConfig();
		const url = new URL(`${config.FACEBOOK_OAUTH_BASE_URL}/${getMetaApiVersion()}/dialog/oauth`);
		url.searchParams.set('client_id', config.META_APP_ID ?? '');
		url.searchParams.set('redirect_uri', config.FACEBOOK_REDIRECT_URI ?? '');
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', SCOPES.join(','));
		url.searchParams.set('state', state);
		return url.toString();
	},
	async completeAuthorization(code, _verifier, fetchImpl = fetch) {
		const { accessToken } = await exchangeMetaCode(code, getConfig().FACEBOOK_REDIRECT_URI, fetchImpl);
		return listPages(accessToken, fetchImpl);
	},
	optionsFromAccessToken: (accessToken, fetchImpl = fetch) => listPages(accessToken.trim(), fetchImpl),
	sync(account, now, fetchImpl = fetch) {
		return runProviderSync(account, now, fetchImpl, {
			pull: ({ credentials }) => pullPage(account.platform_account_id, credentials.accessToken, fetchImpl),
		});
	},
};
