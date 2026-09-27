import { env } from 'cloudflare:workers';
import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../src/lib/crypto';
import { call, signUp, uniqueEmail, VALID_PASSWORD } from './helpers';

async function sessionRow(token: string) {
	return env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).first<{
		id: string;
		revoked_at: number | null;
	}>();
}

describe('POST /api/auth/signup', () => {
	it('creates a user, profile and session and returns only safe data', async () => {
		const email = uniqueEmail();
		const result = await call('POST', '/api/auth/signup', {
			body: { email: `  ${email.toUpperCase()} `, password: VALID_PASSWORD, displayName: '  Ada Lovelace ' },
		});

		expect(result.status).toBe(201);
		expect(result.body.success).toBe(true);
		const data = (result.body as { data: any }).data;
		expect(data.user).toEqual({
			id: expect.any(String),
			email, // normalized: trimmed + lower-cased
			profile: { displayName: 'Ada Lovelace', avatarKey: null },
		});
		expect(data.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(Date.parse(data.session.expiresAt)).toBeGreaterThan(Date.now());
		expect(JSON.stringify(result.body)).not.toMatch(/password|token_hash/i);

		const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(data.user.id).first<{ password_hash: string }>();
		expect(user?.password_hash).toMatch(/^pbkdf2-sha256\$100000\$/);
		expect(user?.password_hash).not.toContain(VALID_PASSWORD);

		// Only the token digest is stored.
		const stored = await env.DB.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').bind(data.user.id).first<{ token_hash: string }>();
		expect(stored?.token_hash).toBe(await sha256Hex(data.session.token));
		expect(stored?.token_hash).not.toBe(data.session.token);
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
		const data = (result.body as { data: any }).data;
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
		await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?')
			.bind(Date.now(), await sha256Hex(account.token))
			.run();

		const result = await call('GET', '/api/auth/me', { token: account.token });
		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
	});

	it('rejects an expired session', async () => {
		const account = await signUp();
		await env.DB.prepare('UPDATE sessions SET created_at = ?, expires_at = ? WHERE token_hash = ?')
			.bind(Date.now() - 2000, Date.now() - 1000, await sha256Hex(account.token))
			.run();

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

		const row = await sessionRow(account.token);
		expect(row?.revoked_at).toEqual(expect.any(Number));
	});

	it('prevents a revoked session from accessing protected endpoints', async () => {
		const account = await signUp();
		await call('POST', '/api/auth/logout', { token: account.token });

		const me = await call('GET', '/api/auth/me', { token: account.token });
		expect(me.status).toBe(401);
		const logoutAgain = await call('POST', '/api/auth/logout', { token: account.token });
		expect(logoutAgain.status).toBe(401);
	});

	it('only revokes the session used, not the user\'s other sessions', async () => {
		const account = await signUp();
		const login = await call('POST', '/api/auth/login', { body: { email: account.email, password: account.password } });
		const secondToken = (login.body as { data: any }).data.session.token as string;

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
