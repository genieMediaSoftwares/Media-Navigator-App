import { Router } from 'express';

import { findPublicUserById, getPreferences, updateDisplayName, updatePreferences } from '../db/users';
import { HttpError, ok, readJsonObject } from '../lib/http';
import { displayNameError, stringField, throwIfInvalid } from '../lib/validation';
import { authOf, requireAuth } from '../middleware/auth';
import { UserPreferences } from '../models';
import { resolveTimeZone } from '../services/intelligence';
import { avatarDownloadUrl, confirmAvatarUpload, createAvatarUpload, removeAvatar } from '../services/storage/avatars';

const BOOLEAN_PREFERENCES = ['notifySyncResults', 'notifyAiInsights', 'notifyConnectionIssues'] as const;

export function profileRouter(): Router {
	const router = Router();
	router.use(requireAuth);

	/** PATCH /api/profile { displayName } */
	router.patch('/', async (req, res) => {
		const userId = authOf(req).user.id;
		const displayName = stringField(readJsonObject(req), 'displayName').trim();
		const invalid = displayNameError(displayName);
		throwIfInvalid(invalid ? { displayName: invalid } : {});
		await updateDisplayName(userId, displayName, req.now);
		ok(res, { user: await findPublicUserById(userId) });
	});

	/** GET /api/profile/preferences */
	router.get('/preferences', async (req, res) => {
		ok(res, { preferences: await getPreferences(authOf(req).user.id) });
	});

	/** PATCH /api/profile/preferences { timeZone?, notifySyncResults?, notifyAiInsights?, notifyConnectionIssues? } */
	router.patch('/preferences', async (req, res) => {
		const body = readJsonObject(req);
		const updates: Partial<UserPreferences> = {};
		for (const key of BOOLEAN_PREFERENCES) {
			if (body[key] === undefined) continue;
			if (typeof body[key] !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', `${key} must be true or false.`, { [key]: 'Must be true or false.' });
			updates[key] = body[key] as boolean;
		}
		if (body.timeZone !== undefined) {
			if (body.timeZone !== null && (typeof body.timeZone !== 'string' || resolveTimeZone(body.timeZone) !== body.timeZone)) {
				throw new HttpError(400, 'VALIDATION_ERROR', 'Unknown time zone.', { timeZone: 'Unknown time zone.' });
			}
			updates.timeZone = body.timeZone as string | null;
		}
		ok(res, { preferences: await updatePreferences(authOf(req).user.id, updates, req.now) });
	});

	/** POST /api/profile/avatar/upload-url { mimeType, size } — presigned R2 PUT for a profile photo. */
	router.post('/avatar/upload-url', async (req, res) => {
		const body = readJsonObject(req);
		ok(res, await createAvatarUpload(authOf(req).user.id, stringField(body, 'mimeType'), Number(body.size), req.now), 201);
	});

	/** POST /api/profile/avatar/confirm { fileId } — verifies the uploaded object and sets it as the avatar. */
	router.post('/avatar/confirm', async (req, res) => {
		const userId = authOf(req).user.id;
		const result = await confirmAvatarUpload(userId, stringField(readJsonObject(req), 'fileId'), req.now);
		ok(res, { ...result, user: await findPublicUserById(userId) });
	});

	/** GET /api/profile/avatar — short-lived download URL, or null when there is no avatar. */
	router.get('/avatar', async (req, res) => {
		ok(res, { url: await avatarDownloadUrl(authOf(req).user.id) });
	});

	/** DELETE /api/profile/avatar */
	router.delete('/avatar', async (req, res) => {
		const userId = authOf(req).user.id;
		await removeAvatar(userId, req.now);
		ok(res, { user: await findPublicUserById(userId) });
	});

	return router;
}
