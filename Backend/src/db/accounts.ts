import { AccountStatus, ConnectedAccount, ConnectedAccountDoc, Platform } from '../models';

/** Row shape used by routes and services (epoch-ms timestamps, as before the MongoDB migration). */
export interface ConnectedAccountRow {
	id: string;
	user_id: string;
	platform: Platform;
	platform_account_id: string;
	account_name: string | null;
	account_username: string;
	profile_picture_url?: string | null;
	status: AccountStatus;
	token_reference: string;
	token_expires_at: number | null;
	created_at: number;
	updated_at: number;
	last_synced_at: number | null;
}

function toRow(doc: ConnectedAccountDoc): ConnectedAccountRow {
	return {
		id: doc._id,
		user_id: doc.userId,
		platform: doc.platform,
		platform_account_id: doc.platformAccountId,
		account_name: doc.accountName ?? null,
		account_username: doc.accountUsername,
		profile_picture_url: doc.profilePictureUrl ?? null,
		status: doc.status,
		token_reference: doc.tokenReference,
		token_expires_at: doc.tokenExpiresAt ? doc.tokenExpiresAt.getTime() : null,
		created_at: doc.createdAt.getTime(),
		updated_at: doc.updatedAt.getTime(),
		last_synced_at: doc.lastSyncedAt ? doc.lastSyncedAt.getTime() : null,
	};
}

export async function findAccountsByUserId(userId: string): Promise<ConnectedAccountRow[]> {
	const docs = await ConnectedAccount.find({ userId }).sort({ createdAt: 1 }).lean<ConnectedAccountDoc[]>();
	return docs.map(toRow);
}

export async function findAccountById(id: string): Promise<ConnectedAccountRow | null> {
	const doc = await ConnectedAccount.findById(id).lean<ConnectedAccountDoc>();
	return doc ? toRow(doc) : null;
}

export async function findAccountByPlatformAndAccountId(platform: Platform, platformAccountId: string): Promise<ConnectedAccountRow | null> {
	const doc = await ConnectedAccount.findOne({ platform, platformAccountId }).lean<ConnectedAccountDoc>();
	return doc ? toRow(doc) : null;
}

export interface AccountUpsert {
	id: string;
	userId: string;
	platform: Platform;
	platformAccountId: string;
	accountName: string | null;
	accountUsername: string;
	profilePictureUrl?: string | null;
	status: AccountStatus;
	tokenReference: string;
	tokenExpiresAt: number | null;
	now: number;
}

/**
 * Inserts the account, or updates the existing (user, platform, platform account) row in place,
 * keeping its id, creation time and last sync time. Returns the stored row and the token reference
 * it replaced (so the caller can delete the old credential).
 */
export async function upsertConnectedAccount(account: AccountUpsert): Promise<{ row: ConnectedAccountRow; replacedTokenReference: string | null }> {
	const at = new Date(account.now);
	const previous = await ConnectedAccount.findOneAndUpdate(
		{ userId: account.userId, platform: account.platform, platformAccountId: account.platformAccountId },
		{
			$set: {
				accountName: account.accountName,
				accountUsername: account.accountUsername,
				profilePictureUrl: account.profilePictureUrl ?? null,
				status: account.status,
				tokenReference: account.tokenReference,
				tokenExpiresAt: account.tokenExpiresAt === null ? null : new Date(account.tokenExpiresAt),
				updatedAt: at,
			},
			$setOnInsert: { _id: account.id, createdAt: at, lastSyncedAt: null },
		},
		{ upsert: true, returnDocument: 'before' },
	).lean<ConnectedAccountDoc>();

	const stored = await ConnectedAccount.findOne({
		userId: account.userId,
		platform: account.platform,
		platformAccountId: account.platformAccountId,
	}).lean<ConnectedAccountDoc>();
	if (!stored) throw new Error('Connected account missing after upsert');
	const replaced = previous && previous.tokenReference !== account.tokenReference ? previous.tokenReference : null;
	return { row: toRow(stored), replacedTokenReference: replaced };
}

export async function updateAccountStatusAndSynced(
	id: string,
	status: AccountStatus,
	lastSyncedAt: number | null,
	now: number,
	updates?: {
		accountName?: string | null;
		accountUsername?: string;
		profilePictureUrl?: string | null;
	},
): Promise<void> {
	const $set: Record<string, unknown> = { status, updatedAt: new Date(now) };
	if (lastSyncedAt !== null) $set.lastSyncedAt = new Date(lastSyncedAt);
	// Like the former COALESCE: a missing value never erases stored metadata.
	if (updates?.accountName != null) $set.accountName = updates.accountName;
	if (updates?.accountUsername != null) $set.accountUsername = updates.accountUsername;
	if (updates?.profilePictureUrl != null) $set.profilePictureUrl = updates.profilePictureUrl;
	await ConnectedAccount.updateOne({ _id: id }, { $set });
}

export async function updateAccountStatus(id: string, status: AccountStatus, now: number): Promise<void> {
	await ConnectedAccount.updateOne({ _id: id }, { $set: { status, updatedAt: new Date(now) } });
}

export async function deleteConnectedAccount(id: string, userId: string): Promise<boolean> {
	const result = await ConnectedAccount.deleteOne({ _id: id, userId });
	return result.deletedCount > 0;
}
