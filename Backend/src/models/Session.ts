import { model, Schema } from 'mongoose';

import { newId } from './ids';

export interface SessionDoc {
	_id: string;
	userId: string;
	/** Hex SHA-256 of the session token. The token itself is never stored. */
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
	lastUsedAt: Date;
	/** null while active; set on logout or "sign out everywhere". */
	revokedAt: Date | null;
}

const sessionSchema = new Schema<SessionDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		tokenHash: { type: String, required: true, minlength: 64, maxlength: 64 },
		expiresAt: { type: Date, required: true },
		createdAt: { type: Date, required: true },
		lastUsedAt: { type: Date, required: true },
		revokedAt: { type: Date, default: null },
	},
	{ collection: 'sessions', versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'sessions_token_hash_unique' });
sessionSchema.index({ userId: 1 }, { name: 'sessions_user_id_idx' });
// Expired sessions are purged a week after expiry; until then a stale token still gets SESSION_EXPIRED.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60, name: 'sessions_expires_at_ttl' });

export const Session = model<SessionDoc>('Session', sessionSchema);
