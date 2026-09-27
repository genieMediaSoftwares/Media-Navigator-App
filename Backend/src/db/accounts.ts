export interface ConnectedAccountRow {
	id: string;
	user_id: string;
	platform: string;
	platform_account_id: string;
	account_name: string | null;
	account_username: string;
	profile_picture_url?: string | null;
	status: 'connected' | 'reauthorization_required' | 'error';
	token_reference: string;
	token_expires_at: number | null;
	created_at: number;
	updated_at: number;
	last_synced_at: number | null;
}

export async function findAccountsByUserId(db: D1Database, userId: string): Promise<ConnectedAccountRow[]> {
	const statement = db
		.prepare(
			`SELECT id, user_id, platform, platform_account_id, account_name, account_username, profile_picture_url, status, token_reference, token_expires_at, created_at, updated_at, last_synced_at
       FROM connected_accounts
       WHERE user_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(userId);
	const result = await statement.all<ConnectedAccountRow>();
	return result.results;
}

export async function findAccountById(db: D1Database, id: string): Promise<ConnectedAccountRow | null> {
	const statement = db
		.prepare(
			`SELECT id, user_id, platform, platform_account_id, account_name, account_username, profile_picture_url, status, token_reference, token_expires_at, created_at, updated_at, last_synced_at
       FROM connected_accounts
       WHERE id = ?`,
		)
		.bind(id);
	return statement.first<ConnectedAccountRow>();
}

export async function findAccountByPlatformAndAccountId(
	db: D1Database,
	platform: string,
	platformAccountId: string,
): Promise<ConnectedAccountRow | null> {
	const statement = db
		.prepare(
			`SELECT id, user_id, platform, platform_account_id, account_name, account_username, profile_picture_url, status, token_reference, token_expires_at, created_at, updated_at, last_synced_at
       FROM connected_accounts
       WHERE platform = ? AND platform_account_id = ?`,
		)
		.bind(platform, platformAccountId);
	return statement.first<ConnectedAccountRow>();
}

export async function upsertConnectedAccount(
	db: D1Database,
	account: {
		id: string;
		userId: string;
		platform: string;
		platformAccountId: string;
		accountName: string | null;
		accountUsername: string;
		profilePictureUrl?: string | null;
		status: 'connected' | 'reauthorization_required' | 'error';
		tokenReference: string;
		tokenExpiresAt: number | null;
		now: number;
	},
): Promise<ConnectedAccountRow> {
	const existing = await db
		.prepare(
			`SELECT id, created_at, token_reference, last_synced_at FROM connected_accounts WHERE user_id = ? AND platform = ? AND platform_account_id = ?`,
		)
		.bind(account.userId, account.platform, account.platformAccountId)
		.first<{ id: string; created_at: number; token_reference: string; last_synced_at: number | null }>();

	if (existing) {
		await db
			.prepare(
				`UPDATE connected_accounts
         SET account_name = ?, account_username = ?, profile_picture_url = ?, status = ?, token_reference = ?, token_expires_at = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(
				account.accountName,
				account.accountUsername,
				account.profilePictureUrl ?? null,
				account.status,
				account.tokenReference,
				account.tokenExpiresAt,
				account.now,
				existing.id,
			)
			.run();

		return {
			id: existing.id,
			user_id: account.userId,
			platform: account.platform,
			platform_account_id: account.platformAccountId,
			account_name: account.accountName,
			account_username: account.accountUsername,
			profile_picture_url: account.profilePictureUrl ?? null,
			status: account.status,
			token_reference: account.tokenReference,
			token_expires_at: account.tokenExpiresAt,
			created_at: existing.created_at,
			updated_at: account.now,
			last_synced_at: existing.last_synced_at,
		};
	}

	await db
		.prepare(
			`INSERT INTO connected_accounts
       (id, user_id, platform, platform_account_id, account_name, account_username, profile_picture_url, status, token_reference, token_expires_at, created_at, updated_at, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
		)
		.bind(
			account.id,
			account.userId,
			account.platform,
			account.platformAccountId,
			account.accountName,
			account.accountUsername,
			account.profilePictureUrl ?? null,
			account.status,
			account.tokenReference,
			account.tokenExpiresAt,
			account.now,
			account.now,
		)
		.run();

	return {
		id: account.id,
		user_id: account.userId,
		platform: account.platform,
		platform_account_id: account.platformAccountId,
		account_name: account.accountName,
		account_username: account.accountUsername,
		profile_picture_url: account.profilePictureUrl ?? null,
		status: account.status,
		token_reference: account.tokenReference,
		token_expires_at: account.tokenExpiresAt,
		created_at: account.now,
		updated_at: account.now,
		last_synced_at: null,
	};
}

export async function updateAccountStatusAndSynced(
	db: D1Database,
	id: string,
	status: 'connected' | 'reauthorization_required' | 'error',
	lastSyncedAt: number,
	now: number,
	updates?: {
		accountName?: string | null;
		accountUsername?: string;
		profilePictureUrl?: string | null;
	},
): Promise<void> {
	await db
		.prepare(
			`UPDATE connected_accounts
       SET status = ?, last_synced_at = ?, updated_at = ?,
           account_name = COALESCE(?, account_name),
           account_username = COALESCE(?, account_username),
           profile_picture_url = COALESCE(?, profile_picture_url)
       WHERE id = ?`,
		)
		.bind(
			status,
			lastSyncedAt,
			now,
			updates?.accountName ?? null,
			updates?.accountUsername ?? null,
			updates?.profilePictureUrl ?? null,
			id,
		)
		.run();
}

export async function deleteConnectedAccount(db: D1Database, id: string, userId: string): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM connected_accounts WHERE id = ? AND user_id = ?`)
		.bind(id, userId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}
