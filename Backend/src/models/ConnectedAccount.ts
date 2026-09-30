import { model, Schema } from 'mongoose';

import { newId } from './ids';

export const PLATFORMS = ['instagram', 'youtube', 'linkedin', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ACCOUNT_STATUSES = ['connected', 'reauthorization_required', 'error'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface ConnectedAccountDoc {
	_id: string;
	userId: string;
	platform: Platform;
	/** Instagram user id, Facebook Page id, YouTube channel id, LinkedIn organization URN id. */
	platformAccountId: string;
	accountName: string | null;
	/** Handle shown in the app (@username, channel handle, page/organization vanity name). */
	accountUsername: string;
	profilePictureUrl: string | null;
	status: AccountStatus;
	/** Id of the encrypted PlatformCredential. Not a secret on its own. */
	tokenReference: string;
	tokenExpiresAt: Date | null;
	lastSyncedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const connectedAccountSchema = new Schema<ConnectedAccountDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		platform: { type: String, required: true, enum: PLATFORMS },
		platformAccountId: { type: String, required: true },
		accountName: { type: String, default: null },
		accountUsername: { type: String, required: true },
		profilePictureUrl: { type: String, default: null },
		status: { type: String, required: true, enum: ACCOUNT_STATUSES },
		tokenReference: { type: String, required: true },
		tokenExpiresAt: { type: Date, default: null },
		lastSyncedAt: { type: Date, default: null },
		createdAt: { type: Date, required: true },
		updatedAt: { type: Date, required: true },
	},
	{ collection: 'connected_accounts', versionKey: false },
);

connectedAccountSchema.index(
	{ userId: 1, platform: 1, platformAccountId: 1 },
	{ unique: true, name: 'connected_accounts_user_platform_account_unique' },
);
connectedAccountSchema.index({ platform: 1, platformAccountId: 1 }, { name: 'connected_accounts_platform_account_idx' });
connectedAccountSchema.index({ tokenReference: 1 }, { unique: true, name: 'connected_accounts_token_reference_unique' });
connectedAccountSchema.index({ userId: 1, createdAt: 1 }, { name: 'connected_accounts_user_id_idx' });

export const ConnectedAccount = model<ConnectedAccountDoc>('ConnectedAccount', connectedAccountSchema);
