import { randomBytes, sha256Hex, toBase64Url } from '../lib/crypto';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_BYTES = 32;

export interface IssuedSession {
	/** Plaintext token for the client. Returned once and never stored. */
	token: string;
	expiresAt: number;
	statement: D1PreparedStatement;
}

export interface SessionLookup {
	id: string;
	user_id: string;
	email: string;
	expires_at: number;
	last_used_at: number;
	revoked_at: number | null;
}

export function hashSessionToken(token: string): Promise<string> {
	return sha256Hex(token);
}

/** Generates a new random token and the statement that stores its hash. Nothing is written until it runs. */
export async function issueSession(db: D1Database, userId: string, now: number): Promise<IssuedSession> {
	const token = toBase64Url(randomBytes(SESSION_TOKEN_BYTES));
	const expiresAt = now + SESSION_TTL_MS;
	const statement = db
		.prepare(
			'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
		)
		.bind(crypto.randomUUID(), userId, await hashSessionToken(token), expiresAt, now, now);
	return { token, expiresAt, statement };
}

export function findSessionByTokenHash(db: D1Database, tokenHash: string): Promise<SessionLookup | null> {
	return db
		.prepare(
			`SELECT s.id, s.user_id, u.email, s.expires_at, s.last_used_at, s.revoked_at
			 FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.token_hash = ?`,
		)
		.bind(tokenHash)
		.first<SessionLookup>();
}

export async function touchSession(db: D1Database, sessionId: string, now: number): Promise<void> {
	await db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').bind(now, sessionId).run();
}

export async function revokeSession(db: D1Database, sessionId: string, now: number): Promise<void> {
	await db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(now, sessionId).run();
}
