import { randomBytes, sha256Hex, toBase64Url } from '../lib/crypto';
import { Session, User } from '../models';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_BYTES = 32;

export interface IssuedSession {
	id: string;
	/** Plaintext token for the client. Returned once and never stored. */
	token: string;
	expiresAt: number;
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

/** Generates a new random token and stores only its SHA-256 hash. */
export async function issueSession(userId: string, now: number): Promise<IssuedSession> {
	const token = toBase64Url(randomBytes(SESSION_TOKEN_BYTES));
	const expiresAt = now + SESSION_TTL_MS;
	const session = await Session.create({
		userId,
		tokenHash: await hashSessionToken(token),
		expiresAt: new Date(expiresAt),
		createdAt: new Date(now),
		lastUsedAt: new Date(now),
		revokedAt: null,
	});
	return { id: session._id, token, expiresAt };
}

export async function findSessionByTokenHash(tokenHash: string): Promise<SessionLookup | null> {
	const session = await Session.findOne({ tokenHash }).lean();
	if (!session) return null;
	const user = await User.findById(session.userId, { email: 1 }).lean();
	if (!user) return null;
	return {
		id: session._id,
		user_id: session.userId,
		email: user.email,
		expires_at: session.expiresAt.getTime(),
		last_used_at: session.lastUsedAt.getTime(),
		revoked_at: session.revokedAt ? session.revokedAt.getTime() : null,
	};
}

export async function touchSession(sessionId: string, now: number): Promise<void> {
	await Session.updateOne({ _id: sessionId }, { $set: { lastUsedAt: new Date(now) } });
}

export async function revokeSession(sessionId: string, now: number): Promise<void> {
	await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(now) } });
}

/** Revokes every active session of the user except `keepSessionId`. Returns how many were revoked. */
export async function revokeOtherSessions(userId: string, keepSessionId: string | null, now: number): Promise<number> {
	const result = await Session.updateMany(
		{ userId, revokedAt: null, ...(keepSessionId && { _id: { $ne: keepSessionId } }) },
		{ $set: { revokedAt: new Date(now) } },
	);
	return result.modifiedCount;
}

export async function countActiveSessions(userId: string, now: number): Promise<number> {
	return Session.countDocuments({ userId, revokedAt: null, expiresAt: { $gt: new Date(now) } });
}
