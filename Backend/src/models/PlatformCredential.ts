import { model, Schema } from 'mongoose';

/**
 * An encrypted platform credential (access/refresh token). `iv` and `ciphertext` are AES-256-GCM output
 * (base64url, auth tag appended to the ciphertext). Plaintext tokens are never stored, returned by the
 * API, logged, or sent to Gemini.
 */
export interface PlatformCredentialDoc {
	/** The token reference stored on ConnectedAccount (`cred_<uuid>`). */
	_id: string;
	userId: string;
	iv: string;
	ciphertext: string;
	createdAt: Date;
}

const platformCredentialSchema = new Schema<PlatformCredentialDoc>(
	{
		_id: { type: String, required: true },
		userId: { type: String, required: true, ref: 'User' },
		iv: { type: String, required: true },
		ciphertext: { type: String, required: true },
		createdAt: { type: Date, required: true },
	},
	{ collection: 'platform_credentials', versionKey: false },
);

platformCredentialSchema.index({ userId: 1 }, { name: 'platform_credentials_user_id_idx' });

export const PlatformCredential = model<PlatformCredentialDoc>('PlatformCredential', platformCredentialSchema);
