import { getConfig } from '../config/env';
import { HttpError } from '../lib/http';

export interface InstagramAccountInfo {
	platformAccountId: string;
	accountUsername: string;
	accountName: string | null;
	profilePictureUrl: string | null;
}

export function getMetaApiVersion(): string {
	return getConfig().META_API_VERSION || 'v21.0';
}

export function isInstagramOAuthConfigured(): boolean {
	const config = getConfig();
	return Boolean(config.META_APP_ID && config.META_APP_SECRET && config.META_REDIRECT_URI);
}

/** Constructs the official Meta OAuth authorization URL for the Instagram Graph API. */
export function buildInstagramAuthorizationUrl(state: string): string {
	const { META_APP_ID: appId, META_REDIRECT_URI: redirectUri } = getConfig();
	if (!appId || !redirectUri) {
		throw new HttpError(503, 'CONFIG_ERROR', "Instagram connection isn't configured yet. Missing META_APP_ID or META_REDIRECT_URI.");
	}

	const scopes = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'].join(',');
	const url = new URL(`https://www.facebook.com/${getMetaApiVersion()}/dialog/oauth`);
	url.searchParams.set('client_id', appId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', scopes);
	url.searchParams.set('state', state);
	return url.toString();
}

/**
 * Exchanges an OAuth authorization code for a long-lived Meta user access token (official endpoints).
 * `redirectUri` must equal the one used in the authorization request.
 */
export async function exchangeMetaCode(
	code: string,
	redirectUri: string | undefined,
	fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresAt: number | null }> {
	const { META_APP_ID: appId, META_APP_SECRET: appSecret } = getConfig();
	if (!appId || !appSecret || !redirectUri) {
		throw new HttpError(503, 'CONFIG_ERROR', "Meta connection isn't configured yet. Server configuration is incomplete.");
	}
	const version = getMetaApiVersion();

	// 1. Authorization code → short-lived user token
	const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
	tokenUrl.searchParams.set('client_id', appId);
	tokenUrl.searchParams.set('client_secret', appSecret);
	tokenUrl.searchParams.set('redirect_uri', redirectUri);
	tokenUrl.searchParams.set('code', code);
	tokenUrl.searchParams.set('grant_type', 'authorization_code');

	const shortLivedRes = await fetchImpl(tokenUrl.toString(), { method: 'GET' });
	const shortLivedData = (await shortLivedRes.json()) as { access_token?: string; error?: { message?: string; code?: number } };
	if (!shortLivedRes.ok || !shortLivedData.access_token) {
		throw new HttpError(400, 'OAUTH_EXCHANGE_FAILED', shortLivedData.error?.message ?? 'Failed to exchange authorization code with Meta.');
	}
	const shortLivedToken = shortLivedData.access_token;

	// 2. Short-lived → long-lived user token (~60 days)
	const longLivedUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
	longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
	longLivedUrl.searchParams.set('client_id', appId);
	longLivedUrl.searchParams.set('client_secret', appSecret);
	longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

	const longLivedRes = await fetchImpl(longLivedUrl.toString(), { method: 'GET' });
	const longLivedData = (await longLivedRes.json()) as { access_token?: string; expires_in?: number };
	if (longLivedRes.ok && longLivedData.access_token) {
		const expiresAt = longLivedData.expires_in ? Date.now() + longLivedData.expires_in * 1000 : null;
		return { accessToken: longLivedData.access_token, expiresAt };
	}
	return { accessToken: shortLivedToken, expiresAt: null };
}

export function exchangeInstagramCode(code: string, fetchImpl: typeof fetch = fetch) {
	return exchangeMetaCode(code, getConfig().META_REDIRECT_URI, fetchImpl);
}

/** Fetches real Instagram account metadata from the Meta Graph API using the provided access token. */
export async function fetchInstagramAccountInfo(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<InstagramAccountInfo> {
	if (!accessToken || accessToken.trim() === '') {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Paste a valid Meta Graph API access token.');
	}

	const version = getMetaApiVersion();
	const cleanToken = accessToken.trim();

	// The user's Facebook Pages, to find the linked Instagram Business/Creator account.
	const accountsUrl = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(cleanToken)}`;
	const accountsRes = await fetchImpl(accountsUrl);
	const accountsData = (await accountsRes.json()) as {
		data?: Array<{
			id: string;
			name: string;
			instagram_business_account?: { id: string; username: string; name?: string | null; profile_picture_url?: string | null };
		}>;
		error?: { message?: string; code?: number; type?: string };
	};

	if (accountsRes.ok && Array.isArray(accountsData.data)) {
		for (const page of accountsData.data) {
			const ig = page.instagram_business_account;
			if (ig?.id) {
				return {
					platformAccountId: ig.id,
					accountUsername: ig.username,
					accountName: ig.name ?? page.name ?? null,
					profilePictureUrl: ig.profile_picture_url ?? null,
				};
			}
		}
	}

	// Fallback: Instagram API with Instagram Login (graph.instagram.com).
	const meUrl = `https://graph.instagram.com/${version}/me?fields=id,username,name,account_type,profile_picture_url&access_token=${encodeURIComponent(cleanToken)}`;
	const meRes = await fetchImpl(meUrl);
	const meData = (await meRes.json()) as {
		id?: string;
		username?: string;
		name?: string | null;
		profile_picture_url?: string | null;
		error?: { message?: string; code?: number };
	};

	if (meRes.ok && meData.id && meData.username) {
		return {
			platformAccountId: meData.id,
			accountUsername: meData.username,
			accountName: meData.name ?? null,
			profilePictureUrl: meData.profile_picture_url ?? null,
		};
	}

	if (
		accountsData.error?.code === 190 ||
		meData.error?.code === 190 ||
		accountsRes.status === 400 ||
		accountsRes.status === 401 ||
		meRes.status === 400 ||
		meRes.status === 401
	) {
		throw new HttpError(
			400,
			'INVALID_TOKEN',
			'Meta rejected the access token. Please check that your token is valid and includes required Instagram permissions.',
		);
	}

	throw new HttpError(
		400,
		'ELIGIBILITY_ERROR',
		accountsData.error?.message ?? meData.error?.message ?? 'No eligible Instagram Business or Creator account was found associated with this Meta token.',
	);
}
