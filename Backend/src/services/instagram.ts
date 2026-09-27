import { randomBytes, toBase64Url } from '../lib/crypto';
import { HttpError } from '../lib/http';

export interface InstagramAccountInfo {
	platformAccountId: string;
	accountUsername: string;
	accountName: string | null;
}

const DEFAULT_META_API_VERSION = 'v21.0';
const STATE_TTL_SECONDS = 600; // 10 minutes

export function getMetaApiVersion(env: Env): string {
	return env.META_API_VERSION && env.META_API_VERSION.trim() !== ''
		? env.META_API_VERSION
		: DEFAULT_META_API_VERSION;
}

/** Generates a cryptographically random, 10-minute expiring OAuth state bound to the user. */
export async function createInstagramOAuthState(env: Env, userId: string): Promise<string> {
	const state = toBase64Url(randomBytes(32));
	const key = `oauth_state:${state}`;
	const payload = JSON.stringify({ userId, createdAt: Date.now() });
	await env.CACHE.put(key, payload, { expirationTtl: STATE_TTL_SECONDS });
	return state;
}

/** Validates and consumes an OAuth state. Returns user ID if valid, or null if expired/invalid/already used. */
export async function consumeInstagramOAuthState(env: Env, state: string): Promise<{ userId: string } | null> {
	if (!state || state.trim() === '') return null;
	const key = `oauth_state:${state}`;
	const raw = await env.CACHE.get(key);
	if (!raw) return null;

	// Single-use: delete immediately
	await env.CACHE.delete(key);

	try {
		const parsed = JSON.parse(raw) as { userId: string };
		return { userId: parsed.userId };
	} catch {
		return null;
	}
}

/** Constructs the official Meta OAuth authorization URL for Instagram Graph API. */
export function buildInstagramAuthorizationUrl(env: Env, state: string): string {
	const appId = env.META_APP_ID;
	const redirectUri = env.META_REDIRECT_URI;

	if (!appId || appId.trim() === '' || !redirectUri || redirectUri.trim() === '') {
		throw new HttpError(
			503,
			'CONFIG_ERROR',
			"Instagram connection isn't configured yet. Missing META_APP_ID or META_REDIRECT_URI.",
		);
	}

	const version = getMetaApiVersion(env);
	const scopes = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'].join(',');

	const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
	url.searchParams.set('client_id', appId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', scopes);
	url.searchParams.set('state', state);

	return url.toString();
}

/** Exchanges an OAuth authorization code for a long-lived Meta access token using official Meta API endpoints. */
export async function exchangeInstagramCode(
	env: Env,
	code: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresAt: number | null }> {
	const appId = env.META_APP_ID;
	const appSecret = env.META_APP_SECRET;
	const redirectUri = env.META_REDIRECT_URI;

	if (!appId || !appSecret || !redirectUri) {
		throw new HttpError(
			503,
			'CONFIG_ERROR',
			"Instagram connection isn't configured yet. Server configuration is incomplete.",
		);
	}

	const version = getMetaApiVersion(env);

	// 1. Exchange authorization code for short-lived access token
	const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
	tokenUrl.searchParams.set('client_id', appId);
	tokenUrl.searchParams.set('client_secret', appSecret);
	tokenUrl.searchParams.set('redirect_uri', redirectUri);
	tokenUrl.searchParams.set('code', code);
	tokenUrl.searchParams.set('grant_type', 'authorization_code');

	const shortLivedRes = await fetchImpl(tokenUrl.toString(), { method: 'GET' });
	const shortLivedData = (await shortLivedRes.json()) as {
		access_token?: string;
		error?: { message?: string; code?: number };
	};

	if (!shortLivedRes.ok || !shortLivedData.access_token) {
		const message = shortLivedData.error?.message ?? 'Failed to exchange authorization code with Meta.';
		throw new HttpError(400, 'OAUTH_EXCHANGE_FAILED', message);
	}

	const shortLivedToken = shortLivedData.access_token;

	// 2. Exchange short-lived access token for long-lived access token (~60 days)
	const longLivedUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
	longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
	longLivedUrl.searchParams.set('client_id', appId);
	longLivedUrl.searchParams.set('client_secret', appSecret);
	longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

	const longLivedRes = await fetchImpl(longLivedUrl.toString(), { method: 'GET' });
	const longLivedData = (await longLivedRes.json()) as {
		access_token?: string;
		expires_in?: number;
		error?: { message?: string };
	};

	if (longLivedRes.ok && longLivedData.access_token) {
		const expiresAt = longLivedData.expires_in ? Date.now() + longLivedData.expires_in * 1000 : null;
		return { accessToken: longLivedData.access_token, expiresAt };
	}

	return { accessToken: shortLivedToken, expiresAt: null };
}

/** Fetches real Instagram account metadata from Meta Graph API using the provided access token. */
export async function fetchInstagramAccountInfo(
	env: Env,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<InstagramAccountInfo> {
	if (!accessToken || accessToken.trim() === '') {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Paste a valid Meta Graph API access token.');
	}

	const version = getMetaApiVersion(env);
	const cleanToken = accessToken.trim();

	// Query user's Facebook Pages to find linked Instagram Business/Creator account
	const accountsUrl = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(cleanToken)}`;
	const accountsRes = await fetchImpl(accountsUrl);
	const accountsData = (await accountsRes.json()) as {
		data?: Array<{
			id: string;
			name: string;
			instagram_business_account?: {
				id: string;
				username: string;
				name?: string | null;
			};
		}>;
		error?: { message?: string; code?: number; type?: string };
	};

	if (accountsRes.ok && accountsData.data && Array.isArray(accountsData.data)) {
		for (const page of accountsData.data) {
			if (page.instagram_business_account && page.instagram_business_account.id) {
				return {
					platformAccountId: page.instagram_business_account.id,
					accountUsername: page.instagram_business_account.username,
					accountName: page.instagram_business_account.name ?? page.name ?? null,
				};
			}
		}
	}

	// Fallback: Query Graph API /me directly for Instagram Login endpoint
	const meUrl = `https://graph.instagram.com/${version}/me?fields=id,username,name,account_type&access_token=${encodeURIComponent(cleanToken)}`;
	const meRes = await fetchImpl(meUrl);
	const meData = (await meRes.json()) as {
		id?: string;
		username?: string;
		name?: string | null;
		error?: { message?: string; code?: number };
	};

	if (meRes.ok && meData.id && meData.username) {
		return {
			platformAccountId: meData.id,
			accountUsername: meData.username,
			accountName: meData.name ?? null,
		};
	}

	// If Meta returned an error indicating invalid or expired token
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

	const errorMsg =
		accountsData.error?.message ??
		meData.error?.message ??
		'No eligible Instagram Business or Creator account was found associated with this Meta token.';

	throw new HttpError(400, 'ELIGIBILITY_ERROR', errorMsg);
}
