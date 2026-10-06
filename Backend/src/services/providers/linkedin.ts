import { getConfig } from '../../config/env';
import { ContentInput } from '../../db/content';
import { HttpError } from '../../lib/http';
import { ContentFormat } from '../../models';
import type { PlatformCredentials } from '../credentials';
import { metricNumber, requestJson } from './http';
import { PulledData, runProviderSync } from './runSync';
import { ConnectOption, ProviderAuthError, SocialProvider } from './types';

// LinkedIn organization (company) pages through LinkedIn's versioned REST API (Community Management
// API). Requires an app approved for the organization scopes below; the member must be an
// administrator of the page. Refresh tokens are only issued to some apps; without one the user
// reconnects when the 60-day token expires.

const SCOPES = ['r_organization_admin', 'r_organization_social'];

function headers(credentials: PlatformCredentials, finder = false): Record<string, string> {
	return {
		Authorization: `Bearer ${credentials.accessToken}`,
		'LinkedIn-Version': getConfig().LINKEDIN_API_VERSION,
		'X-Restli-Protocol-Version': '2.0.0',
		...(finder && { 'X-RestLi-Method': 'FINDER' }),
	};
}

const orgUrn = (id: string) => `urn:li:organization:${id}`;

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
}

function toCredentials(token: TokenResponse): PlatformCredentials {
	if (!token.access_token) throw new ProviderAuthError('LinkedIn did not return an access token.');
	return {
		accessToken: token.access_token,
		refreshToken: token.refresh_token ?? null,
		expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
		scope: token.scope,
	};
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenResponse> {
	return requestJson<TokenResponse>(`${getConfig().LINKEDIN_OAUTH_BASE_URL}/accessToken`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params).toString(),
		fetchImpl,
		authStatuses: [400, 401],
	});
}

interface Organization {
	id?: number;
	localizedName?: string;
	vanityName?: string;
}

async function listOrganizations(credentials: PlatformCredentials, fetchImpl: typeof fetch): Promise<ConnectOption[]> {
	const config = getConfig();
	const acls = await requestJson<{ elements?: Array<{ organization?: string }> }>(
		`${config.LINKEDIN_API_BASE_URL}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50`,
		{ headers: headers(credentials, true), fetchImpl, authStatuses: [401, 403] },
	);
	const ids = (acls.elements ?? [])
		.map((e) => /^urn:li:organization:(\d+)$/.exec(e.organization ?? '')?.[1])
		.filter((id): id is string => Boolean(id));
	if (ids.length === 0) {
		throw new HttpError(400, 'ELIGIBILITY_ERROR', 'No LinkedIn pages were found where you are an administrator.');
	}
	const options: ConnectOption[] = [];
	for (const id of ids) {
		const org = await requestJson<Organization>(`${config.LINKEDIN_API_BASE_URL}/organizations/${id}`, { headers: headers(credentials), fetchImpl });
		options.push({
			platformAccountId: id,
			accountName: org.localizedName ?? null,
			accountUsername: org.vanityName ?? org.localizedName ?? id,
			profilePictureUrl: null,
			credentials,
		});
	}
	return options;
}

interface Post {
	id?: string;
	commentary?: string;
	publishedAt?: number;
	createdAt?: number;
	lifecycleState?: string;
	content?: { media?: { id?: string }; multiImage?: unknown; article?: { title?: string }; poll?: unknown; celebration?: unknown };
}

export function classifyLinkedInPost(post: Post): ContentFormat {
	const content = post.content;
	// No content object (or an empty one): a text-only post.
	if (!content || Object.keys(content).length === 0) return 'TEXT';
	if (content.multiImage) return 'CAROUSEL';
	if (content.poll) return 'POLL';
	if (content.article) return 'ARTICLE';
	const media = content.media?.id ?? '';
	if (media.startsWith('urn:li:video:')) return 'VIDEO';
	if (media.startsWith('urn:li:image:')) return 'IMAGE';
	if (media.startsWith('urn:li:document:')) return 'DOCUMENT';
	return 'POST';
}

async function pullOrganization(orgId: string, credentials: PlatformCredentials, fetchImpl: typeof fetch): Promise<PulledData> {
	const config = getConfig();
	const apiBase = config.LINKEDIN_API_BASE_URL;
	const org = await requestJson<Organization>(`${apiBase}/organizations/${orgId}`, { headers: headers(credentials), fetchImpl, authStatuses: [401, 403] });
	let followers: number | null = null;
	try {
		const size = await requestJson<{ firstDegreeSize?: number }>(
			`${apiBase}/networkSizes/${encodeURIComponent(orgUrn(orgId))}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
			{ headers: headers(credentials), fetchImpl },
		);
		followers = metricNumber(size.firstDegreeSize);
	} catch (error) {
		if (error instanceof ProviderAuthError) throw error;
	}

	const posts: Post[] = [];
	for (let start = 0; posts.length < config.LINKEDIN_MAX_POSTS; start += 50) {
		const res = await requestJson<{ elements?: Post[] }>(
			`${apiBase}/posts?author=${encodeURIComponent(orgUrn(orgId))}&q=author&count=50&start=${start}&sortBy=LAST_MODIFIED`,
			{ headers: headers(credentials, true), fetchImpl },
		);
		const page = (res.elements ?? []).filter((p) => p.id && p.lifecycleState !== 'DRAFT');
		posts.push(...page);
		if ((res.elements ?? []).length < 50) break;
	}

	const stats = await fetchShareStatistics(orgId, posts, credentials, fetchImpl);
	const content: ContentInput[] = [];
	for (const post of posts.slice(0, config.LINKEDIN_MAX_POSTS)) {
		const urn = post.id as string;
		let likes: number | null = null;
		let comments: number | null = null;
		try {
			const social = await requestJson<{ reactionSummaries?: Record<string, { count?: number }>; commentSummary?: { count?: number } }>(
				`${apiBase}/socialMetadata/${encodeURIComponent(urn)}`,
				{ headers: headers(credentials), fetchImpl },
			);
			const reactions = Object.values(social.reactionSummaries ?? {}).map((r) => metricNumber(r.count));
			likes = reactions.length > 0 ? reactions.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
			comments = metricNumber(social.commentSummary?.count);
		} catch (error) {
			if (error instanceof ProviderAuthError) throw error;
			likes = stats.get(urn)?.likes ?? null;
			comments = stats.get(urn)?.comments ?? null;
		}
		const s = stats.get(urn);
		const published = post.publishedAt ?? post.createdAt ?? null;
		content.push({
			platformContentId: urn,
			format: classifyLinkedInPost(post),
			mediaType: post.content?.media?.id?.split(':')[2]?.toUpperCase() ?? null,
			title: post.content?.article?.title ?? null,
			caption: post.commentary ?? post.content?.article?.title ?? null,
			permalink: `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`,
			mediaUrl: null,
			thumbnailUrl: null,
			timestampRaw: published !== null ? String(published) : null,
			publishedAt: published !== null ? new Date(published) : null,
			counts: { likes, comments },
			insights: s ? { reach: s.uniqueImpressions, shares: s.shares } : null,
			extraMetrics: s ? { impressions: s.impressions, clicks: s.clicks } : null,
		});
	}

	return {
		profile: {
			accountName: org.localizedName ?? null,
			accountUsername: org.vanityName ?? org.localizedName ?? null,
			profilePictureUrl: null,
			followers,
			following: null,
			mediaCount: null,
		},
		accountInsights: [],
		content,
	};
}

interface ShareStats {
	impressions: number | null;
	uniqueImpressions: number | null;
	clicks: number | null;
	shares: number | null;
	likes: number | null;
	comments: number | null;
}

/** Lifetime per-post statistics for organization posts; empty when not authorized. */
async function fetchShareStatistics(orgId: string, posts: Post[], credentials: PlatformCredentials, fetchImpl: typeof fetch): Promise<Map<string, ShareStats>> {
	const config = getConfig();
	const apiBase = config.LINKEDIN_API_BASE_URL;
	const result = new Map<string, ShareStats>();
	const shares = posts.map((p) => p.id as string).filter((id) => id.startsWith('urn:li:share:'));
	const ugcPosts = posts.map((p) => p.id as string).filter((id) => id.startsWith('urn:li:ugcPost:'));
	for (let i = 0; i < Math.max(shares.length, ugcPosts.length); i += 20) {
		const list = (ids: string[]) => `List(${ids.map(encodeURIComponent).join(',')})`;
		const shareBatch = shares.slice(i, i + 20);
		const ugcBatch = ugcPosts.slice(i, i + 20);
		const params = [
			'q=organizationalEntity',
			`organizationalEntity=${encodeURIComponent(orgUrn(orgId))}`,
			...(shareBatch.length ? [`shares=${list(shareBatch)}`] : []),
			...(ugcBatch.length ? [`ugcPosts=${list(ugcBatch)}`] : []),
		];
		try {
			const res = await requestJson<{
				elements?: Array<{
					share?: string;
					ugcPost?: string;
					totalShareStatistics?: {
						impressionCount?: number;
						uniqueImpressionsCount?: number;
						clickCount?: number;
						shareCount?: number;
						likeCount?: number;
						commentCount?: number;
					};
				}>;
			}>(`${apiBase}/organizationalEntityShareStatistics?${params.join('&')}`, { headers: headers(credentials, true), fetchImpl });
			for (const element of res.elements ?? []) {
				const urn = element.share ?? element.ugcPost;
				const t = element.totalShareStatistics;
				if (!urn || !t) continue;
				result.set(urn, {
					impressions: metricNumber(t.impressionCount),
					uniqueImpressions: metricNumber(t.uniqueImpressionsCount),
					clicks: metricNumber(t.clickCount),
					shares: metricNumber(t.shareCount),
					likes: metricNumber(t.likeCount),
					comments: metricNumber(t.commentCount),
				});
			}
		} catch (error) {
			if (error instanceof ProviderAuthError) throw error;
			return result;
		}
	}
	return result;
}

export const linkedinProvider: SocialProvider = {
	platform: 'linkedin',
	usesPkce: false,
	isConfigured() {
		return this.missingConfiguration().length === 0;
	},
	missingConfiguration() {
		const config = getConfig();
		return (['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'] as const).filter((key) => !config[key]);
	},
	authorizationUrl(state) {
		const config = getConfig();
		const url = new URL(`${config.LINKEDIN_OAUTH_BASE_URL}/authorization`);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('client_id', config.LINKEDIN_CLIENT_ID ?? '');
		url.searchParams.set('redirect_uri', config.LINKEDIN_REDIRECT_URI ?? '');
		url.searchParams.set('state', state);
		url.searchParams.set('scope', SCOPES.join(' '));
		return url.toString();
	},
	async completeAuthorization(code, _verifier, fetchImpl = fetch) {
		const config = getConfig();
		const credentials = toCredentials(
			await tokenRequest(
				{
					grant_type: 'authorization_code',
					code,
					redirect_uri: config.LINKEDIN_REDIRECT_URI ?? '',
					client_id: config.LINKEDIN_CLIENT_ID ?? '',
					client_secret: config.LINKEDIN_CLIENT_SECRET ?? '',
				},
				fetchImpl,
			),
		);
		return listOrganizations(credentials, fetchImpl);
	},
	async optionsFromAccessToken(accessToken, fetchImpl = fetch) {
		const credentials: PlatformCredentials = {
			accessToken,
			refreshToken: null,
			expiresAt: null,
			scope: SCOPES.join(' '),
		};
		return listOrganizations(credentials, fetchImpl);
	},
	sync(account, now, fetchImpl = fetch) {
		return runProviderSync(account, now, fetchImpl, {
			async refresh(credentials, impl) {
				if (!credentials.refreshToken) return null;
				const config = getConfig();
				const refreshed = toCredentials(
					await tokenRequest(
						{
							grant_type: 'refresh_token',
							refresh_token: credentials.refreshToken,
							client_id: config.LINKEDIN_CLIENT_ID ?? '',
							client_secret: config.LINKEDIN_CLIENT_SECRET ?? '',
						},
						impl,
					),
				);
				return { ...refreshed, refreshToken: refreshed.refreshToken ?? credentials.refreshToken };
			},
			pull: ({ credentials }) => pullOrganization(account.platform_account_id, credentials, fetchImpl),
		});
	},
};
