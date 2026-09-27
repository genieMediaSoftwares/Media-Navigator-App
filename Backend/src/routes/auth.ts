import { issueSession, revokeSession } from '../db/sessions';
import {
	findCredentialsByEmail,
	findPublicUserById,
	insertUserWithProfile,
	isUniqueEmailViolation,
	PublicUser,
} from '../db/users';
import { FieldErrors, HttpError, ok, readJsonObject } from '../lib/http';
import { equalizeVerificationTiming, hashPassword, verifyPassword } from '../lib/password';
import { RequestContext } from '../lib/router';
import {
	displayNameError,
	emailError,
	normalizeEmail,
	passwordError,
	stringField,
	throwIfInvalid,
} from '../lib/validation';
import { AuthContext, withAuth } from '../middleware/auth';

function authPayload(user: PublicUser, session: { token: string; expiresAt: number }) {
	return { user, session: { token: session.token, expiresAt: new Date(session.expiresAt).toISOString() } };
}

function emailTaken(): HttpError {
	return new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.', {
		email: 'An account with this email already exists.',
	});
}

async function loadPublicUser(db: D1Database, userId: string): Promise<PublicUser> {
	const user = await findPublicUserById(db, userId);
	// A session or insert referencing a missing user means the database is inconsistent.
	if (!user) throw new Error(`User ${userId} not found after authentication`);
	return user;
}

export async function signup({ request, env, now }: RequestContext): Promise<Response> {
	const body = await readJsonObject(request);
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

	if (await findCredentialsByEmail(env.DB, email)) throw emailTaken();

	const userId = crypto.randomUUID();
	const passwordHash = await hashPassword(password);
	const session = await issueSession(env.DB, userId, now);

	try {
		// D1 batches run as a single transaction: user, profile and session are created together or not at all.
		await env.DB.batch([...insertUserWithProfile(env.DB, { userId, email, passwordHash, displayName, now }), session.statement]);
	} catch (error) {
		if (isUniqueEmailViolation(error)) throw emailTaken();
		throw error;
	}

	return ok(authPayload(await loadPublicUser(env.DB, userId), session), 201);
}

export async function login({ request, env, now }: RequestContext): Promise<Response> {
	const body = await readJsonObject(request);
	const email = normalizeEmail(stringField(body, 'email'));
	const password = stringField(body, 'password');

	const fields: FieldErrors = {};
	if (!email) fields.email = 'Email is required.';
	if (!password) fields.password = 'Password is required.';
	throwIfInvalid(fields);

	const credentials = await findCredentialsByEmail(env.DB, email);
	if (!credentials) {
		await equalizeVerificationTiming(password);
		throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
	}
	if (!(await verifyPassword(password, credentials.password_hash))) {
		throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
	}

	// Always a brand-new server-generated token; client-supplied tokens are never adopted (no session fixation).
	const session = await issueSession(env.DB, credentials.id, now);
	await session.statement.run();

	return ok(authPayload(await loadPublicUser(env.DB, credentials.id), session));
}

export const logout = withAuth(async ({ env, now }: RequestContext, auth: AuthContext) => {
	await revokeSession(env.DB, auth.session.id, now);
	return ok(null);
});

export const me = withAuth(async ({ env }: RequestContext, auth: AuthContext) => {
	return ok({ user: await loadPublicUser(env.DB, auth.user.id) });
});

// No email delivery provider is configured yet, so no reset can be sent. This endpoint states
// that honestly instead of pretending an email went out.
export function forgotPassword(): Response {
	throw new HttpError(
		501,
		'PASSWORD_RESET_NOT_CONFIGURED',
		'Password reset is not available yet because email delivery has not been configured.',
	);
}
