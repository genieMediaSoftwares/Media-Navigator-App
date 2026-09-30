import { model, Schema } from 'mongoose';

import { PLATFORMS, Platform } from './ConnectedAccount';

const encryptedSchema = new Schema<{ iv: string; ciphertext: string }>(
	{ iv: { type: String, required: true }, ciphertext: { type: String, required: true } },
	{ _id: false },
);

/** Single-use OAuth `state`, bound to the user who started the flow. Expires after 10 minutes. */
export interface OAuthStateDoc {
	/** SHA-256 of the state value; the raw state only travels through the provider redirect. */
	_id: string;
	userId: string;
	platform: Platform;
	/** Where the callback sends the user back (validated app deep link). */
	returnUrl: string;
	/** PKCE verifier, encrypted (Google). */
	codeVerifier: { iv: string; ciphertext: string } | null;
	expiresAt: Date;
}

const oauthStateSchema = new Schema<OAuthStateDoc>(
	{
		_id: { type: String, required: true },
		userId: { type: String, required: true, ref: 'User' },
		platform: { type: String, required: true, enum: PLATFORMS },
		returnUrl: { type: String, required: true },
		codeVerifier: { type: encryptedSchema, default: null },
		expiresAt: { type: Date, required: true },
	},
	{ collection: 'oauth_states', versionKey: false },
);
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'oauth_states_expires_ttl' });

export const OAuthState = model<OAuthStateDoc>('OAuthState', oauthStateSchema);

export interface PendingOption {
	platformAccountId: string;
	accountName: string | null;
	accountUsername: string;
	profilePictureUrl: string | null;
}

/**
 * An authorized OAuth grant that covers several connectable accounts (Facebook Pages, YouTube channels,
 * LinkedIn organizations) and is waiting for the user to choose one. The grant is stored encrypted and
 * expires after 15 minutes.
 */
export interface PendingConnectionDoc {
	_id: string;
	userId: string;
	platform: Platform;
	options: PendingOption[];
	/** Encrypted JSON: user-level credential plus per-option credentials where the platform issues them. */
	grant: { iv: string; ciphertext: string };
	expiresAt: Date;
}

const pendingConnectionSchema = new Schema<PendingConnectionDoc>(
	{
		_id: { type: String, required: true },
		userId: { type: String, required: true, ref: 'User' },
		platform: { type: String, required: true, enum: PLATFORMS },
		options: [
			{
				_id: false,
				platformAccountId: { type: String, required: true },
				accountName: { type: String, default: null },
				accountUsername: { type: String, required: true },
				profilePictureUrl: { type: String, default: null },
			},
		],
		grant: { type: encryptedSchema, required: true },
		expiresAt: { type: Date, required: true },
	},
	{ collection: 'pending_connections', versionKey: false },
);
pendingConnectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'pending_connections_expires_ttl' });

export const PendingConnection = model<PendingConnectionDoc>('PendingConnection', pendingConnectionSchema);
