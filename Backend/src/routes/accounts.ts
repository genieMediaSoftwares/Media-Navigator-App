import { Router } from 'express';

import { findAccountsByUserId } from '../db/accounts';
import { HttpError, ok, queryParam, readJsonObject } from '../lib/http';
import { stringField } from '../lib/validation';
import { authOf, requireAuth } from '../middleware/auth';
import {
	completeAuthorization,
	completePendingSelection,
	connectWithAccessToken,
	disconnectAccount,
	getPendingSelection,
	requireOwnedAccount,
	startAuthorization,
	syncConnectedAccount,
} from '../services/connections';
import { fetchAccountDashboard } from '../services/instagramSync';
import { isPlatform } from '../services/platforms';

function platformParam(value: unknown) {
	if (!isPlatform(value)) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a supported platform.', { platform: 'Unsupported platform.' });
	}
	return value;
}

export function accountsRouter(): Router {
	const router = Router();

	/** GET /api/accounts/callback/:platform — public OAuth redirect target; answers with a redirect to the app. */
	router.get('/callback/:platform', async (req, res) => {
		const platform = platformParam(req.params.platform);
		const location = await completeAuthorization(
			platform,
			{
				code: queryParam(req, 'code'),
				state: queryParam(req, 'state'),
				error: queryParam(req, 'error'),
				errorDescription: queryParam(req, 'error_description'),
			},
			req.now,
		);
		res.set('Cache-Control', 'no-store').redirect(302, location);
	});

	router.use(requireAuth);

	/** GET /api/accounts — connected accounts of the user (never credentials). */
	router.get('/', async (req, res) => {
		const rows = await findAccountsByUserId(authOf(req).user.id);
		ok(res, {
			accounts: rows.map((row) => ({
				id: row.id,
				platform: row.platform,
				handle: row.account_username,
				displayName: row.account_name,
				profilePictureUrl: row.profile_picture_url ?? null,
				status: row.status,
				connectedAt: new Date(row.created_at).toISOString(),
				lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
			})),
		});
	});

	/** GET /api/accounts/connect/:platform?returnUrl= — OAuth authorization URL with a fresh state. */
	router.get('/connect/:platform', async (req, res) => {
		const platform = platformParam(req.params.platform);
		ok(res, { authorizationUrl: await startAuthorization(authOf(req).user.id, platform, queryParam(req, 'returnUrl'), req.now) });
	});

	/**
	 * POST /api/accounts/connect { platform, accessToken?, returnUrl? }
	 * Instagram: a user-supplied Meta token (required). Facebook: a Meta user token, or OAuth when none is
	 * given. YouTube / LinkedIn: always OAuth — the response carries the authorization URL.
	 */
	router.post('/connect', async (req, res) => {
		const auth = authOf(req);
		const body = readJsonObject(req);
		const platform = platformParam(stringField(body, 'platform'));
		const accessToken = stringField(body, 'accessToken').trim();

		if (platform === 'instagram' && accessToken === '') {
			throw new HttpError(400, 'VALIDATION_ERROR', 'Paste a valid Meta Graph API access token.', { accessToken: 'Access token is required.' });
		}
		if (accessToken === '' || platform === 'youtube' || platform === 'linkedin') {
			const returnUrl = stringField(body, 'returnUrl') || null;
			ok(res, { authorizationUrl: await startAuthorization(auth.user.id, platform, returnUrl, req.now) });
			return;
		}
		ok(res, await connectWithAccessToken(auth.user.id, platform, accessToken, req.now));
	});

	/** GET /api/accounts/pending/:id — accounts (Pages, channels, organizations) waiting for the user's choice. */
	router.get('/pending/:id', async (req, res) => {
		ok(res, { selection: await getPendingSelection(authOf(req).user.id, req.params.id as string, req.now) });
	});

	/** POST /api/accounts/pending/:id/select { platformAccountId } */
	router.post('/pending/:id/select', async (req, res) => {
		const body = readJsonObject(req);
		const account = await completePendingSelection(authOf(req).user.id, req.params.id as string, stringField(body, 'platformAccountId'), req.now);
		ok(res, { account });
	});

	/** DELETE /api/accounts/:id — disconnects the account and deletes its credential and synced data. */
	router.delete('/:id', async (req, res) => {
		await disconnectAccount(authOf(req).user.id, req.params.id as string, req.now);
		ok(res, { message: 'Account disconnected successfully.' });
	});

	/** POST /api/accounts/:id/sync */
	router.post('/:id/sync', async (req, res) => {
		ok(res, await syncConnectedAccount(authOf(req).user.id, req.params.id as string, req.now));
	});

	/** GET /api/accounts/:id/dashboard — profile metrics and the latest 50 items. */
	router.get('/:id/dashboard', async (req, res) => {
		const auth = authOf(req);
		await requireOwnedAccount(auth.user.id, req.params.id as string);
		ok(res, await fetchAccountDashboard(auth.user.id, req.params.id as string));
	});

	return router;
}
