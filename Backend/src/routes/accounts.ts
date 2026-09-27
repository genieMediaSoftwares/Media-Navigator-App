import {
	deleteConnectedAccount,
	findAccountById,
	findAccountByPlatformAndAccountId,
	findAccountsByUserId,
	upsertConnectedAccount,
} from '../db/accounts';
import { HttpError, ok, readJsonObject } from '../lib/http';
import { stringField } from '../lib/validation';
import { withAuth } from '../middleware/auth';
import { deletePlatformCredentials, storePlatformCredentials } from '../services/credentials';
import {
	buildInstagramAuthorizationUrl,
	consumeInstagramOAuthState,
	createInstagramOAuthState,
	exchangeInstagramCode,
	fetchInstagramAccountInfo,
} from '../services/instagram';
import { fetchInstagramDashboard, syncInstagramAccount } from '../services/instagramSync';

const SUPPORTED_PLATFORMS: Record<string, string> = {
	instagram: 'Instagram',
	youtube: 'YouTube',
	linkedin: 'LinkedIn',
	facebook: 'Facebook',
};

/** GET /api/accounts/connect/instagram - Authenticated. Generates OAuth state & authorization URL. */
export const connectInstagram = withAuth(async (context, auth) => {
	const state = await createInstagramOAuthState(context.env, auth.user.id);
	const authorizationUrl = buildInstagramAuthorizationUrl(context.env, state);
	return ok({ authorizationUrl });
});

/** POST /api/accounts/connect - Authenticated. Connects platform using user-supplied token. */
export const connectAccount = withAuth(async (context, auth) => {
	const body = await readJsonObject(context.request);
	const platform = stringField(body, 'platform');
	const name = SUPPORTED_PLATFORMS[platform];
	if (!name) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a supported platform.', { platform: 'Unsupported platform.' });
	}

	if (platform === 'instagram') {
		const accessToken = stringField(body, 'accessToken');
		if (!accessToken || accessToken.trim() === '') {
			throw new HttpError(400, 'VALIDATION_ERROR', 'Paste a valid Meta Graph API access token.', {
				accessToken: 'Access token is required.',
			});
		}

		const cleanToken = accessToken.trim();

		// Validate token with Meta and fetch real Instagram account details
		const accountInfo = await fetchInstagramAccountInfo(context.env, cleanToken);

		// Check for existing connected account across all users
		const existingGlobal = await findAccountByPlatformAndAccountId(context.env.DB, 'instagram', accountInfo.platformAccountId);

		if (existingGlobal && existingGlobal.user_id !== auth.user.id) {
			throw new HttpError(
				409,
				'ACCOUNT_ALREADY_CONNECTED',
				'This Instagram account is already connected to another Media Navigator user account.',
			);
		}

		// Encrypt and store credential in KV using AES-256-GCM
		const tokenReference = await storePlatformCredentials(context.env, auth.user.id, {
			accessToken: cleanToken,
		});

		// Upsert in D1
		const accountId = existingGlobal?.id ?? crypto.randomUUID();
		const accountRow = await upsertConnectedAccount(context.env.DB, {
			id: accountId,
			userId: auth.user.id,
			platform: 'instagram',
			platformAccountId: accountInfo.platformAccountId,
			accountName: accountInfo.accountName,
			accountUsername: accountInfo.accountUsername,
			status: 'connected',
			tokenReference,
			tokenExpiresAt: null,
			now: context.now,
		});

		// Trigger initial sync automatically upon successful connection
		try {
			await syncInstagramAccount(context.env, auth.user.id, accountRow.id, context.now);
		} catch {
			// Failures in initial sync do not revert account creation
		}

		return ok({
			account: {
				id: accountRow.id,
				platform: accountRow.platform as 'instagram',
				accountName: accountRow.account_name,
				username: accountRow.account_username,
				status: accountRow.status,
			},
		});
	}

	throw new HttpError(501, 'FEATURE_NOT_AVAILABLE', `Connecting ${name} isn’t available yet.`);
});

/** GET /api/accounts/callback/instagram - Public Meta OAuth callback endpoint. */
export async function instagramCallback(context: { request: Request; env: Env; now: number }): Promise<Response> {
	const url = new URL(context.request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	const deepLinkScheme = 'medianavigator://oauth/callback';

	if (error) {
		const message = errorDescription || 'Instagram authorization was denied.';
		const redirectUrl = `${deepLinkScheme}?status=error&message=${encodeURIComponent(message)}`;
		return Response.redirect(redirectUrl, 302);
	}

	if (!code || !state) {
		const redirectUrl = `${deepLinkScheme}?status=error&message=${encodeURIComponent('Missing code or state parameter.')}`;
		return Response.redirect(redirectUrl, 302);
	}

	// Validate state
	const stateRecord = await consumeInstagramOAuthState(context.env, state);
	if (!stateRecord) {
		const redirectUrl = `${deepLinkScheme}?status=error&message=${encodeURIComponent('Invalid or expired state parameter.')}`;
		return Response.redirect(redirectUrl, 302);
	}

	try {
		// Exchange code for tokens
		const { accessToken, expiresAt } = await exchangeInstagramCode(context.env, code);

		// Fetch real Instagram account details
		const accountInfo = await fetchInstagramAccountInfo(context.env, accessToken);

		// Store platform credentials securely in KV using AES-256-GCM
		const tokenReference = await storePlatformCredentials(context.env, stateRecord.userId, {
			accessToken,
			expiresAt,
		});

		// Store or update account record in D1 connected_accounts
		const accountId = crypto.randomUUID();
		const accountRow = await upsertConnectedAccount(context.env.DB, {
			id: accountId,
			userId: stateRecord.userId,
			platform: 'instagram',
			platformAccountId: accountInfo.platformAccountId,
			accountName: accountInfo.accountName,
			accountUsername: accountInfo.accountUsername,
			status: 'connected',
			tokenReference,
			tokenExpiresAt: expiresAt,
			now: context.now,
		});

		// Trigger initial sync
		try {
			await syncInstagramAccount(context.env, stateRecord.userId, accountRow.id, context.now);
		} catch {
			// Soft-fail sync on OAuth redirect
		}

		const redirectUrl = `${deepLinkScheme}?status=success&platform=instagram`;
		return Response.redirect(redirectUrl, 302);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to complete Instagram connection.';
		const redirectUrl = `${deepLinkScheme}?status=error&message=${encodeURIComponent(message)}`;
		return Response.redirect(redirectUrl, 302);
	}
}

/** GET /api/accounts - Authenticated. Returns connected accounts belonging to the user. */
export const listAccounts = withAuth(async (context, auth) => {
	const rows = await findAccountsByUserId(context.env.DB, auth.user.id);
	const accounts = rows.map((row) => ({
		id: row.id,
		platform: row.platform as 'instagram' | 'youtube' | 'linkedin' | 'facebook',
		handle: row.account_username,
		displayName: row.account_name,
		profilePictureUrl: row.profile_picture_url ?? null,
		status: row.status,
		connectedAt: new Date(row.created_at).toISOString(),
		lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
	}));

	return ok({ accounts });
});

/** DELETE /api/accounts/:id - Authenticated. Disconnects account owned by user. */
export const disconnectAccount = withAuth(async (context, auth) => {
	const id = context.params?.id;
	if (!id) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Account ID is required.');
	}

	const account = await findAccountById(context.env.DB, id);
	if (!account || account.user_id !== auth.user.id) {
		throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Connected account not found.');
	}

	// Delete credentials from KV
	await deletePlatformCredentials(context.env, auth.user.id, account.token_reference);

	// Delete from D1
	await deleteConnectedAccount(context.env.DB, id, auth.user.id);

	return ok({ message: 'Account disconnected successfully.' });
});

/** POST /api/accounts/:id/sync - Authenticated. Syncs account data from platform. */
export const syncAccount = withAuth(async (context, auth) => {
	const id = context.params?.id;
	if (!id) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Account ID is required.');
	}

	const summary = await syncInstagramAccount(context.env, auth.user.id, id, context.now);
	return ok(summary);
});

/** GET /api/accounts/:id/dashboard - Authenticated. Returns account dashboard data. */
export const getAccountDashboard = withAuth(async (context, auth) => {
	const id = context.params?.id;
	if (!id) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Account ID is required.');
	}

	const dashboard = await fetchInstagramDashboard(context.env, auth.user.id, id);
	return ok(dashboard);
});
