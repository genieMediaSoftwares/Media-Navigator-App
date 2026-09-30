import { Router } from 'express';

import { getConfig } from '../config/env';
import { countActiveSessions, issueSession, revokeOtherSessions, revokeSession } from '../db/sessions';
import {
	findCredentialsByEmail,
	findPasswordHashById,
	findPublicUserById,
	insertUserWithProfile,
	isUniqueEmailViolation,
	PublicUser,
	updatePasswordHash,
} from '../db/users';
import { FieldErrors, HttpError, ok, readJsonObject } from '../lib/http';
import { equalizeVerificationTiming, hashPassword, verifyPassword } from '../lib/password';
import { displayNameError, emailError, normalizeEmail, passwordError, stringField, throwIfInvalid } from '../lib/validation';
import { authOf, requireAuth } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { deleteUserAccount } from '../services/accountDeletion';
import { notify } from '../services/notifications';

function authPayload(user: PublicUser, session: { token: string; expiresAt: number }) {
	return { user, session: { token: session.token, expiresAt: new Date(session.expiresAt).toISOString() } };
}

function emailTaken(): HttpError {
	return new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.', {
		email: 'An account with this email already exists.',
	});
}

async function loadPublicUser(userId: string): Promise<PublicUser> {
	const user = await findPublicUserById(userId);
	// A session or insert referencing a missing user means the database is inconsistent.
	if (!user) throw new Error(`User ${userId} not found after authentication`);
	return user;
}

async function requireCurrentPassword(userId: string, password: string): Promise<void> {
	const hash = await findPasswordHashById(userId);
	if (!password || !hash || !(await verifyPassword(password, hash))) {
		// 403, not 401: the app treats 401 on an authenticated call as an invalid session and signs out.
		throw new HttpError(403, 'INCORRECT_PASSWORD', 'Your current password is incorrect.', { currentPassword: 'Incorrect password.' });
	}
}

export function authRouter(): Router {
	const router = Router();
	const limitAuth = authRateLimit(getConfig().AUTH_RATE_LIMIT);

	router.post('/signup', limitAuth, async (req, res) => {
		const body = readJsonObject(req);
		const email = normalizeEmail(stringField(body, 'email'));
		const password = stringField(body, 'password');
		const displayName = stringField(body, 'displayName').trim();

		const fields: FieldErrors = {};
		const invalidEmail = emailError(email);
		const invalidPassword = passwordError(password);
		const invalidName = displayNameError(displayName);
		if (invalidEmail) fields.email = invalidEmail;
		if (invalidPassword) fields.password = invalidPassword;
		if (invalidName) fields.displayName = invalidName;
		throwIfInvalid(fields);

		if (await findCredentialsByEmail(email)) throw emailTaken();

		const userId = crypto.randomUUID();
		const passwordHash = await hashPassword(password);
		try {
			await insertUserWithProfile({ userId, email, passwordHash, displayName, now: req.now });
		} catch (error) {
			if (isUniqueEmailViolation(error)) throw emailTaken();
			throw error;
		}
		const session = await issueSession(userId, req.now);
		ok(res, authPayload(await loadPublicUser(userId), session), 201);
	});

	router.post('/login', limitAuth, async (req, res) => {
		const body = readJsonObject(req);
		const email = normalizeEmail(stringField(body, 'email'));
		const password = stringField(body, 'password');

		const fields: FieldErrors = {};
		if (!email) fields.email = 'Email is required.';
		if (!password) fields.password = 'Password is required.';
		throwIfInvalid(fields);

		const credentials = await findCredentialsByEmail(email);
		if (!credentials) {
			await equalizeVerificationTiming(password);
			throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
		}
		if (!(await verifyPassword(password, credentials.password_hash))) {
			throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
		}

		// Always a brand-new server-generated token; client-supplied tokens are never adopted (no session fixation).
		const session = await issueSession(credentials.id, req.now);
		ok(res, authPayload(await loadPublicUser(credentials.id), session));
	});

	router.post('/logout', requireAuth, async (req, res) => {
		await revokeSession(authOf(req).session.id, req.now);
		ok(res, null);
	});

	router.get('/me', requireAuth, async (req, res) => {
		ok(res, { user: await loadPublicUser(authOf(req).user.id) });
	});

	// No email delivery provider is configured, so no reset can be sent. This endpoint states that
	// honestly instead of pretending an email went out.
	router.post('/forgot-password', () => {
		throw new HttpError(501, 'PASSWORD_RESET_NOT_CONFIGURED', 'Password reset is not available yet because email delivery has not been configured.');
	});

	// ---- Security -------------------------------------------------------------------------

	/** GET /api/auth/sessions — how many devices are signed in (tokens are never listed). */
	router.get('/sessions', requireAuth, async (req, res) => {
		ok(res, { activeSessions: await countActiveSessions(authOf(req).user.id, req.now) });
	});

	/** POST /api/auth/change-password { currentPassword, newPassword } — also signs out other devices. */
	router.post('/change-password', requireAuth, limitAuth, async (req, res) => {
		const auth = authOf(req);
		const body = readJsonObject(req);
		const currentPassword = stringField(body, 'currentPassword');
		const newPassword = stringField(body, 'newPassword');
		const invalid = passwordError(newPassword);
		throwIfInvalid(invalid ? { newPassword: invalid } : {});
		await requireCurrentPassword(auth.user.id, currentPassword);
		if (currentPassword === newPassword) {
			throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a password you are not already using.', { newPassword: 'Choose a new password.' });
		}
		await updatePasswordHash(auth.user.id, await hashPassword(newPassword), req.now);
		const revoked = await revokeOtherSessions(auth.user.id, auth.session.id, req.now);
		await notify(auth.user.id, {
			event: 'security',
			kind: 'system',
			title: 'Password changed',
			body: revoked > 0 ? `Your password was changed and ${revoked} other ${revoked === 1 ? 'device was' : 'devices were'} signed out.` : 'Your password was changed.',
			now: req.now,
		});
		ok(res, { otherSessionsRevoked: revoked });
	});

	/** POST /api/auth/logout-others — revokes every session except the current one. */
	router.post('/logout-others', requireAuth, async (req, res) => {
		const auth = authOf(req);
		ok(res, { otherSessionsRevoked: await revokeOtherSessions(auth.user.id, auth.session.id, req.now) });
	});

	/** POST /api/auth/delete-account { password } — permanently deletes the user and all their data. */
	router.post('/delete-account', requireAuth, limitAuth, async (req, res) => {
		const auth = authOf(req);
		const body = readJsonObject(req);
		await requireCurrentPassword(auth.user.id, stringField(body, 'password'));
		await deleteUserAccount(auth.user.id);
		ok(res, { deleted: true });
	});

	return router;
}
