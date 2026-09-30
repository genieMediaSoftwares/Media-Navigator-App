import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { findSessionByTokenHash, hashSessionToken, touchSession } from '../db/sessions';
import { HttpError } from '../lib/http';

export interface AuthContext {
	user: { id: string; email: string };
	session: { id: string; expiresAt: number };
}

declare module 'express-serve-static-core' {
	interface Request {
		/** Set by requireAuth. */
		auth?: AuthContext;
		/** Request time in epoch milliseconds, captured once per request. */
		now: number;
	}
}

// Tokens are 32 random bytes, base64url-encoded without padding.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// Avoid a database write on every request; lastUsedAt is accurate to about a minute.
const TOUCH_INTERVAL_MS = 60 * 1000;

function unauthorized(code: string, message: string): HttpError {
	return new HttpError(401, code, message, undefined, { 'WWW-Authenticate': 'Bearer' });
}

function readBearerToken(req: Request): string | null {
	const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') ?? '');
	return match ? match[1] : null;
}

/** Resolves the session from the Authorization header, or throws a 401 HttpError. */
export async function authenticate(req: Request): Promise<AuthContext> {
	const token = readBearerToken(req);
	if (!token) throw unauthorized('AUTH_REQUIRED', 'Authentication is required.');
	if (!TOKEN_PATTERN.test(token)) throw unauthorized('INVALID_SESSION', 'Your session is invalid. Please sign in again.');

	const session = await findSessionByTokenHash(await hashSessionToken(token));
	if (!session || session.revoked_at !== null) {
		throw unauthorized('INVALID_SESSION', 'Your session is invalid. Please sign in again.');
	}
	if (session.expires_at <= req.now) {
		throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
	}

	if (req.now - session.last_used_at > TOUCH_INTERVAL_MS) {
		touchSession(session.id, req.now).catch((error: unknown) => {
			console.error('Failed to update session lastUsedAt', { sessionId: session.id, error: String(error) });
		});
	}

	return {
		user: { id: session.user_id, email: session.email },
		session: { id: session.id, expiresAt: session.expires_at },
	};
}

/** Only lets requests with a valid, unexpired, unrevoked session through. */
export const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
	req.auth = await authenticate(req);
	next();
};

/** The authenticated context; only call from handlers mounted behind requireAuth. */
export function authOf(req: Request): AuthContext {
	if (!req.auth) throw new Error('authOf() called on an unauthenticated route');
	return req.auth;
}
