// All queries use bound parameters (D1 prepared statements); never interpolate input into SQL.

export interface UserCredentials {
	id: string;
	password_hash: string;
}

/** User shape that is safe to return to clients. */
export interface PublicUser {
	id: string;
	email: string;
	profile: {
		displayName: string;
		avatarKey: string | null;
	} | null;
}

interface PublicUserRow {
	id: string;
	email: string;
	display_name: string | null;
	avatar_key: string | null;
}

export function findCredentialsByEmail(db: D1Database, email: string): Promise<UserCredentials | null> {
	return db.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first<UserCredentials>();
}

export async function findPublicUserById(db: D1Database, userId: string): Promise<PublicUser | null> {
	const row = await db
		.prepare(
			`SELECT u.id, u.email, p.display_name, p.avatar_key
			 FROM users u LEFT JOIN profiles p ON p.user_id = u.id
			 WHERE u.id = ?`,
		)
		.bind(userId)
		.first<PublicUserRow>();
	if (!row) return null;
	return {
		id: row.id,
		email: row.email,
		profile: row.display_name === null ? null : { displayName: row.display_name, avatarKey: row.avatar_key },
	};
}

export interface NewUser {
	userId: string;
	email: string;
	passwordHash: string;
	displayName: string;
	now: number;
}

/** Statements that create a user and their profile; run them in one D1 batch (a transaction). */
export function insertUserWithProfile(db: D1Database, user: NewUser): D1PreparedStatement[] {
	return [
		db
			.prepare('INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
			.bind(user.userId, user.email, user.passwordHash, user.now, user.now),
		db
			.prepare(
				'INSERT INTO profiles (id, user_id, display_name, avatar_key, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
			)
			.bind(crypto.randomUUID(), user.userId, user.displayName, user.now, user.now),
	];
}

export function isUniqueEmailViolation(error: unknown): boolean {
	return error instanceof Error && /UNIQUE constraint failed: users\.email/.test(error.message);
}
