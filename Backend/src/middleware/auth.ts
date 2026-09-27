import { findSessionByTokenHash, hashSessionToken, touchSession } from '../db/sessions';
import { HttpError } from '../lib/http';
import { Handler, RequestContext } from '../lib/router';

export interface AuthContext {
	user: { id: string; email: string };
	session: { id: string; expiresAt: number };
}

export type AuthenticatedHandler = (context: RequestContext, auth: AuthContext) => Promise<Response> | Response;

// Tokens are 32 random bytes, base64url-encoded without padding.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// Avoid a D1 write on every request; last_used_at is accurate to about a minute.
const TOUCH_INTERVAL_MS = 60 * 1000;

function unauthorized(code: string, message: string): HttpError {
	return new HttpError(401, code, message, undefined, { 'WWW-Authenticate': 'Bearer' });
}

function readBearerToken(request: Request): string | null {
	const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '');
	return match ? match[1] : null;
}

/** Resolves the session from the Authorization header, or throws a 401 HttpError. */
export async function authenticate(context: RequestContext): Promise<AuthContext> {
	const token = readBearerToken(context.request);
	if (!token) throw unauthorized('AUTH_REQUIRED', 'Authentication is required.');
	if (!TOKEN_PATTERN.test(token)) throw unauthorized('INVALID_SESSION', 'Your session is invalid. Please sign in again.');

	const session = await findSessionByTokenHash(context.env.DB, await hashSessionToken(token));
	if (!session || session.revoked_at !== null) {
		throw unauthorized('INVALID_SESSION', 'Your session is invalid. Please sign in again.');
	}
	if (session.expires_at <= context.now) {
		throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
	}

	if (context.now - session.last_used_at > TOUCH_INTERVAL_MS) {
		context.ctx.waitUntil(
			touchSession(context.env.DB, session.id, context.now).catch((error: unknown) => {
				console.error('Failed to update session last_used_at', { sessionId: session.id, error: String(error) });
			}),
		);
	}

	return {
		user: { id: session.user_id, email: session.email },
		session: { id: session.id, expiresAt: session.expires_at },
	};
}

/** Wraps a handler so it only runs for requests with a valid, unexpired, unrevoked session. */
export function withAuth(handler: AuthenticatedHandler): Handler {
	return async (context) => handler(context, await authenticate(context));
}
