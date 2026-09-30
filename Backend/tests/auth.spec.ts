import { describe, expect, it } from 'vitest';

import { sha256Hex, toBase64Url } from '../src/lib/crypto';
import { verifyPassword } from '../src/lib/password';
import { Profile, Session, User } from '../src/models';
import { call, signUp, uniqueEmail, VALID_PASSWORD } from './helpers';

async function sessionDoc(token: string) {
	return Session.findOne({ tokenHash: await sha256Hex(token) }).lean();
}

describe('POST /api/auth/signup', () => {
	it('creates a user, profile and session and returns only safe data', async () => {
		const email = uniqueEmail();
		const result = await call('POST', '/api/auth/signup', {
			body: { email: `  ${email.toUpperCase()} `, password: VALID_PASSWORD, displayName: '  Ada Lovelace ' },
		});

		expect(result.status).toBe(201);
		expect(result.body.success).toBe(true);
		const data = result.body.data;
		expect(data.user).toEqual({
			id: expect.any(String),
			email, // normalized: trimmed + lower-cased
			profile: { displayName: 'Ada Lovelace', avatarKey: null },
		});
		expect(data.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(Date.parse(data.session.expiresAt)).toBeGreaterThan(Date.now());
		expect(JSON.stringify(result.body)).not.toMatch(/password|token_hash|tokenHash/i);

		const user = await User.findById(data.user.id).select('+passwordHash').lean();
		expect(user?.passwordHash).toMatch(/^pbkdf2-sha256\$600000\$/);
		expect(user?.passwordHash).not.toContain(VALID_PASSWORD);
		expect(await Profile.countDocuments({ userId: data.user.id })).toBe(1);

		// Only the token digest is stored.
		const stored = await Session.findOne({ userId: data.user.id }).lean();
		expect(stored?.tokenHash).toBe(await sha256Hex(data.session.token));
		expect(stored?.tokenHash).not.toBe(data.session.token);
	});

	it('rejects a duplicate email (case-insensitive)', async () => {
		const { email } = await signUp();
		const result = await call('POST', '/api/auth/signup', {
			body: { email: email.toUpperCase(), password: VALID_PASSWORD, displayName: 'Someone Else' },
		});
		expect(result.status).toBe(409);
		expect(result.body).toMatchObject({ success: false, error: { code: 'EMAIL_ALREADY_REGISTERED' } });
	});

	it('rejects an invalid email', async () => {
		const result = await call('POST', '/api/auth/signup', {
			body: { email: 'not-an-email', password: VALID_PASSWORD, displayName: 'Test User' },
		});
		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR', fields: { email: expect.any(String) } } });
	});

	it('rejects a weak password', async () => {
		const result = await call('POST', '/api/auth/signup', {
			body: { email: uniqueEmail(), password: 'short', displayName: 'Test User' },
		});
		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR', fields: { password: expect.any(String) } } });
	});

	it('rejects a missing display name and non-JSON bodies', async () => {
		const missingName = await call('POST', '/api/auth/signup', { body: { email: uniqueEmail(), password: VALID_PASSWORD } });
		expect(missingName.status).toBe(400);
		expect(missingName.body).toMatchObject({ error: { fields: { displayName: expect.any(String) } } });

		const notJson = await call('POST', '/api/auth/signup', { headers: { 'Content-Type': 'text/plain' } });
		expect(notJson.status).toBe(415);
	});
});

describe('POST /api/auth/login', () => {
	it('succeeds with correct credentials and issues a new session', async () => {
		const account = await signUp();
		const result = await call('POST', '/api/auth/login', {
			body: { email: ` ${account.email.toUpperCase()}`, password: account.password },
		});

		expect(result.status).toBe(200);
		const data = result.body.data;
		expect(data.user.email).toBe(account.email);
		expect(data.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(data.session.token).not.toBe(account.token);
		expect(JSON.stringify(result.body)).not.toMatch(/password/i);
	});

	it('fails with an incorrect password', async () => {
		const account = await signUp();
		const result = await call('POST', '/api/auth/login', { body: { email: account.email, password: 'wrong password!' } });
		expect(result.status).toBe(401);
		expect(result.body).toEqual({
			success: false,
			error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
		});
	});

	it('fails with the same error for an unknown email', async () => {
		const result = await call('POST', '/api/auth/login', { body: { email: uniqueEmail(), password: VALID_PASSWORD } });
		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
	});

	it('still verifies password hashes created by the Cloudflare Worker (100,000 iterations)', async () => {
		// Built exactly like the Worker did: PBKDF2-SHA256, 100k iterations, 16-byte salt, 256-bit output.
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('legacy password 1'), 'PBKDF2', false, ['deriveBits']);
		const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256));
		const legacyHash = `pbkdf2-sha256$100000$${toBase64Url(salt)}$${toBase64Url(bits)}`;

		expect(await verifyPassword('legacy password 1', legacyHash)).toBe(true);
		expect(await verifyPassword('legacy password 2', legacyHash)).toBe(false);

		const email = uniqueEmail();
		await User.create({ _id: crypto.randomUUID(), email, passwordHash: legacyHash, createdAt: new Date(), updatedAt: new Date() });
		const login = await call('POST', '/api/auth/login', { body: { email, password: 'legacy password 1' } });
		expect(login.status).toBe(200);
	});
});

describe('GET /api/auth/me', () => {
	it('returns the current user with a valid session', async () => {
		const account = await signUp({ displayName: 'Grace Hopper' });
		const result = await call('GET', '/api/auth/me', { token: account.token });
		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			success: true,
			data: { user: { id: account.userId, email: account.email, profile: { displayName: 'Grace Hopper', avatarKey: null } } },
		});
	});

	it('rejects a missing session', async () => {
		const result = await call('GET', '/api/auth/me');
		expect(result.status).toBe(401);
		expect(result.headers.get('WWW-Authenticate')).toBe('Bearer');
		expect(result.body).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
	});

	it('rejects an unknown or malformed token', async () => {
		const unknown = await call('GET', '/api/auth/me', { token: 'A'.repeat(43) });
		expect(unknown.status).toBe(401);
		expect(unknown.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });

		const malformed = await call('GET', '/api/auth/me', { token: 'not-a-token' });
		expect(malformed.status).toBe(401);
	});

	it('rejects a revoked session', async () => {
		const account = await signUp();
		await Session.updateOne({ tokenHash: await sha256Hex(account.token) }, { $set: { revokedAt: new Date() } });

		const result = await call('GET', '/api/auth/me', { token: account.token });
		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
	});

	it('rejects an expired session', async () => {
		const account = await signUp();
		await Session.updateOne(
			{ tokenHash: await sha256Hex(account.token) },
			{ $set: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } },
		);

		const result = await call('GET', '/api/auth/me', { token: account.token });
		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({ error: { code: 'SESSION_EXPIRED' } });
	});
});

describe('POST /api/auth/logout', () => {
	it('revokes the current session', async () => {
		const account = await signUp();
		const result = await call('POST', '/api/auth/logout', { token: account.token });
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ success: true, data: null });

		const row = await sessionDoc(account.token);
		expect(row?.revokedAt).toBeInstanceOf(Date);
	});

	it('prevents a revoked session from accessing protected endpoints', async () => {
		const account = await signUp();
		await call('POST', '/api/auth/logout', { token: account.token });

		const me = await call('GET', '/api/auth/me', { token: account.token });
		expect(me.status).toBe(401);
		const logoutAgain = await call('POST', '/api/auth/logout', { token: account.token });
		expect(logoutAgain.status).toBe(401);
	});

	it("only revokes the session used, not the user's other sessions", async () => {
		const account = await signUp();
		const login = await call('POST', '/api/auth/login', { body: { email: account.email, password: account.password } });
		const secondToken = login.body.data.session.token as string;

		await call('POST', '/api/auth/logout', { token: account.token });
		const me = await call('GET', '/api/auth/me', { token: secondToken });
		expect(me.status).toBe(200);
	});
});

describe('POST /api/auth/forgot-password', () => {
	it('reports that password reset is not configured instead of pretending to send email', async () => {
		const result = await call('POST', '/api/auth/forgot-password', { body: { email: uniqueEmail() } });
		expect(result.status).toBe(501);
		expect(result.body).toMatchObject({ success: false, error: { code: 'PASSWORD_RESET_NOT_CONFIGURED' } });
	});
});

describe('Security endpoints', () => {
	it('changes the password, keeps the current session and signs out other devices', async () => {
		const account = await signUp();
		const other = (await call('POST', '/api/auth/login', { body: { email: account.email, password: account.password } })).body.data.session.token;

		const wrong = await call('POST', '/api/auth/change-password', {
			token: account.token,
			body: { currentPassword: 'not my password', newPassword: 'brand new password' },
		});
		// 403, not 401: a wrong current password must not sign the app out.
		expect(wrong.status).toBe(403);
		expect(wrong.body).toMatchObject({ error: { code: 'INCORRECT_PASSWORD' } });

		const weak = await call('POST', '/api/auth/change-password', { token: account.token, body: { currentPassword: account.password, newPassword: 'short' } });
		expect(weak.status).toBe(400);

		const changed = await call('POST', '/api/auth/change-password', {
			token: account.token,
			body: { currentPassword: account.password, newPassword: 'brand new password' },
		});
		expect(changed.status).toBe(200);
		expect(changed.body.data).toEqual({ otherSessionsRevoked: 1 });

		expect((await call('GET', '/api/auth/me', { token: account.token })).status).toBe(200);
		expect((await call('GET', '/api/auth/me', { token: other })).status).toBe(401);
		expect((await call('POST', '/api/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(401);
		expect((await call('POST', '/api/auth/login', { body: { email: account.email, password: 'brand new password' } })).status).toBe(200);
	});

	it('counts active sessions and signs out other devices', async () => {
		const account = await signUp();
		await call('POST', '/api/auth/login', { body: { email: account.email, password: account.password } });
		expect((await call('GET', '/api/auth/sessions', { token: account.token })).body.data).toEqual({ activeSessions: 2 });

		const result = await call('POST', '/api/auth/logout-others', { token: account.token });
		expect(result.body.data).toEqual({ otherSessionsRevoked: 1 });
		expect((await call('GET', '/api/auth/sessions', { token: account.token })).body.data).toEqual({ activeSessions: 1 });
	});

	it('deletes the account and everything stored for it after confirming the password', async () => {
		const account = await signUp();
		const refused = await call('POST', '/api/auth/delete-account', { token: account.token, body: { password: 'wrong password' } });
		expect(refused.status).toBe(403);

		const deleted = await call('POST', '/api/auth/delete-account', { token: account.token, body: { password: account.password } });
		expect(deleted.status).toBe(200);
		expect(await User.countDocuments({ _id: account.userId })).toBe(0);
		expect(await Profile.countDocuments({ userId: account.userId })).toBe(0);
		expect(await Session.countDocuments({ userId: account.userId })).toBe(0);
		expect((await call('GET', '/api/auth/me', { token: account.token })).status).toBe(401);
	});
});
