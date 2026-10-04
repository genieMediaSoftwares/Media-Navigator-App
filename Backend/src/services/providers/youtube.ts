import { getConfig } from '../../config/env';
import { ContentInput } from '../../db/content';
import { HttpError } from '../../lib/http';
import type { PlatformCredentials } from '../credentials';
import { metricNumber, requestJson } from './http';
import { PulledData, runProviderSync } from './runSync';
import { ConnectOption, ProviderAuthError, SocialProvider } from './types';

// YouTube through Google OAuth 2.0 (authorization code + PKCE, offline access for a refresh token),
// the YouTube Data API v3 (channel, uploads, per-video statistics) and the YouTube Analytics API v2
// (watch time, shares) when that scope was granted. A hidden like/subscriber count stays null.

const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
const DATA_API = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_VIDEOS = 200;

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	token_type?: string;
}

function toCredentials(token: TokenResponse, previousRefreshToken: string | null = null): PlatformCredentials {
	if (!token.access_token) throw new ProviderAuthError('Google did not return an access token.');
	return {
		accessToken: token.access_token,
		refreshToken: token.refresh_token ?? previousRefreshToken,
		expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
		scope: token.scope,
		tokenType: token.token_type,
	};
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenResponse> {
	return requestJson<TokenResponse>(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params).toString(),
		fetchImpl,
		authStatuses: [400, 401],
	});
}

function authHeaders(credentials: PlatformCredentials) {
	return { Authorization: `Bearer ${credentials.accessToken}` };
}

interface ChannelsResponse {
	items?: Array<{
		id: string;
		snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
		statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
		contentDetails?: { relatedPlaylists?: { uploads?: string } };
	}>;
}

async function listChannels(credentials: PlatformCredentials, fetchImpl: typeof fetch): Promise<ChannelsResponse['items']> {
	const res = await requestJson<ChannelsResponse>(`${DATA_API}/channels?part=snippet,statistics,contentDetails&mine=true`, {
		headers: authHeaders(credentials),
		fetchImpl,
	});
	return res.items ?? [];
}

function thumbnail(thumbnails: Record<string, { url?: string }> | undefined): string | null {
	return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}

async function pullChannel(channelId: string, credentials: PlatformCredentials, fetchImpl: typeof fetch): Promise<PulledData> {
	const channel = (await listChannels(credentials, fetchImpl))?.find((c) => c.id === channelId);
	if (!channel) throw new ProviderAuthError('This YouTube channel is no longer available to the authorized Google account.');

	const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
	const videoIds: string[] = [];
	let pageToken: string | undefined;
	while (uploads && videoIds.length < MAX_VIDEOS) {
		const res = await requestJson<{ items?: Array<{ contentDetails?: { videoId?: string } }>; nextPageToken?: string }>(
			`${DATA_API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploads)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
			{ headers: authHeaders(credentials), fetchImpl },
		);
		for (const item of res.items ?? []) if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
		pageToken = res.nextPageToken;
		if (!pageToken) break;
	}

	const analytics = await fetchVideoAnalytics(credentials, fetchImpl);
	const content: ContentInput[] = [];
	for (let i = 0; i < videoIds.length; i += 50) {
		const res = await requestJson<{
			items?: Array<{
				id: string;
				snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
				statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
			}>;
		}>(`${DATA_API}/videos?part=snippet,statistics&id=${videoIds.slice(i, i + 50).join(',')}`, { headers: authHeaders(credentials), fetchImpl });
		for (const video of res.items ?? []) {
			const stats = analytics.get(video.id);
			const published = video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : null;
			content.push({
				platformContentId: video.id,
				format: 'VIDEO',
				mediaType: 'VIDEO',
				title: video.snippet?.title ?? null,
				caption: video.snippet?.title ?? null,
				permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
				mediaUrl: null,
				thumbnailUrl: thumbnail(video.snippet?.thumbnails),
				timestampRaw: video.snippet?.publishedAt ?? null,
				publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
				counts: {
					views: metricNumber(video.statistics?.viewCount),
					likes: metricNumber(video.statistics?.likeCount),
					comments: metricNumber(video.statistics?.commentCount),
				},
				insights: stats ? { shares: stats.shares } : null,
				extraMetrics: stats ? { estimatedMinutesWatched: stats.minutesWatched, averageViewDurationSeconds: stats.averageViewDuration } : null,
			});
		}
	}

	const hidden = channel.statistics?.hiddenSubscriberCount === true;
	return {
		profile: {
			accountName: channel.snippet?.title ?? null,
			accountUsername: channel.snippet?.customUrl?.replace(/^@/, '') ?? channel.snippet?.title ?? null,
			profilePictureUrl: thumbnail(channel.snippet?.thumbnails),
			followers: hidden ? null : metricNumber(channel.statistics?.subscriberCount),
			following: null,
			mediaCount: metricNumber(channel.statistics?.videoCount),
		},
		accountInsights: [],
		content,
	};
}

/** Lifetime per-video watch time and shares. Empty when the analytics scope was not granted. */
async function fetchVideoAnalytics(
	credentials: PlatformCredentials,
	fetchImpl: typeof fetch,
): Promise<Map<string, { minutesWatched: number | null; averageViewDuration: number | null; shares: number | null }>> {
	const result = new Map<string, { minutesWatched: number | null; averageViewDuration: number | null; shares: number | null }>();
	try {
		const url = new URL(ANALYTICS_API);
		url.searchParams.set('ids', 'channel==MINE');
		url.searchParams.set('startDate', '2005-02-14');
		url.searchParams.set('endDate', new Date().toISOString().slice(0, 10));
		url.searchParams.set('metrics', 'views,estimatedMinutesWatched,averageViewDuration,shares');
		url.searchParams.set('dimensions', 'video');
		url.searchParams.set('sort', '-views');
		url.searchParams.set('maxResults', String(MAX_VIDEOS));
		const report = await requestJson<{ columnHeaders?: Array<{ name: string }>; rows?: unknown[][] }>(url.toString(), {
			headers: authHeaders(credentials),
			fetchImpl,
		});
		const columns = (report.columnHeaders ?? []).map((c) => c.name);
		const col = (row: unknown[], name: string) => metricNumber(row[columns.indexOf(name)]);
		for (const row of report.rows ?? []) {
			const videoId = row[columns.indexOf('video')];
			if (typeof videoId !== 'string') continue;
			result.set(videoId, {
				minutesWatched: col(row, 'estimatedMinutesWatched'),
				averageViewDuration: col(row, 'averageViewDuration'),
				shares: col(row, 'shares'),
			});
		}
	} catch (error) {
		if (error instanceof ProviderAuthError) throw error;
		// Analytics not authorized or unavailable for this channel: those metrics stay null.
	}
	return result;
}

export const youtubeProvider: SocialProvider = {
	platform: 'youtube',
	usesPkce: true,
	isConfigured() {
		return this.missingConfiguration().length === 0;
	},
	missingConfiguration() {
		const config = getConfig();
		return (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const).filter((key) => !config[key]);
	},
	authorizationUrl(state, codeChallenge) {
		const config = getConfig();
		const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		url.searchParams.set('client_id', config.GOOGLE_CLIENT_ID ?? '');
		url.searchParams.set('redirect_uri', config.GOOGLE_REDIRECT_URI ?? '');
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', SCOPES.join(' '));
		url.searchParams.set('access_type', 'offline');
		url.searchParams.set('prompt', 'consent select_account');
		url.searchParams.set('include_granted_scopes', 'true');
		url.searchParams.set('state', state);
		if (codeChallenge) {
			url.searchParams.set('code_challenge', codeChallenge);
			url.searchParams.set('code_challenge_method', 'S256');
		}
		return url.toString();
	},
	async completeAuthorization(code, codeVerifier, fetchImpl = fetch) {
		const config = getConfig();
		const credentials = toCredentials(
			await tokenRequest(
				{
					code,
					client_id: config.GOOGLE_CLIENT_ID ?? '',
					client_secret: config.GOOGLE_CLIENT_SECRET ?? '',
					redirect_uri: config.GOOGLE_REDIRECT_URI ?? '',
					grant_type: 'authorization_code',
					...(codeVerifier && { code_verifier: codeVerifier }),
				},
				fetchImpl,
			),
		);
		const channels = (await listChannels(credentials, fetchImpl)) ?? [];
		if (channels.length === 0) {
			throw new HttpError(400, 'ELIGIBILITY_ERROR', 'This Google account has no YouTube channel. Create a channel or choose another account.');
		}
		return channels.map(
			(channel): ConnectOption => ({
				platformAccountId: channel.id,
				accountName: channel.snippet?.title ?? null,
				accountUsername: channel.snippet?.customUrl?.replace(/^@/, '') ?? channel.snippet?.title ?? channel.id,
				profilePictureUrl: thumbnail(channel.snippet?.thumbnails),
				credentials,
			}),
		);
	},
	async optionsFromAccessToken(accessToken, fetchImpl = fetch) {
		const credentials: PlatformCredentials = {
			accessToken,
			refreshToken: null,
			expiresAt: null,
			scope: SCOPES.join(' '),
		};
		const channels = (await listChannels(credentials, fetchImpl)) ?? [];
		if (channels.length === 0) {
			throw new HttpError(400, 'ELIGIBILITY_ERROR', 'This Google account has no YouTube channel.');
		}
		return channels.map(
			(channel): ConnectOption => ({
				platformAccountId: channel.id,
				accountName: channel.snippet?.title ?? null,
				accountUsername: channel.snippet?.customUrl?.replace(/^@/, '') ?? channel.snippet?.title ?? channel.id,
				profilePictureUrl: thumbnail(channel.snippet?.thumbnails),
				credentials,
			}),
		);
	},
	sync(account, now, fetchImpl = fetch) {
		return runProviderSync(account, now, fetchImpl, {
			async refresh(credentials, impl) {
				if (!credentials.refreshToken) return null;
				const config = getConfig();
				return toCredentials(
					await tokenRequest(
						{
							client_id: config.GOOGLE_CLIENT_ID ?? '',
							client_secret: config.GOOGLE_CLIENT_SECRET ?? '',
							refresh_token: credentials.refreshToken,
							grant_type: 'refresh_token',
						},
						impl,
					),
					credentials.refreshToken,
				);
			},
			pull: ({ credentials }) => pullChannel(account.platform_account_id, credentials, fetchImpl),
		});
	},
};
