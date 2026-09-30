import { DEFAULT_PREFERENCES, Profile, User, UserPreferences } from '../models';

// User and profile persistence. Password hashes are only read by the functions that need them
// (`select: false` on the schema) and never leave this module in a client-facing shape.

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

export async function findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
	const user = await User.findOne({ email }, { _id: 1, passwordHash: 1 }).select('+passwordHash').lean();
	return user ? { id: user._id, password_hash: user.passwordHash } : null;
}

export async function findPasswordHashById(userId: string): Promise<string | null> {
	const user = await User.findById(userId, { passwordHash: 1 }).select('+passwordHash').lean();
	return user?.passwordHash ?? null;
}

export async function findPublicUserById(userId: string): Promise<PublicUser | null> {
	const [user, profile] = await Promise.all([
		User.findById(userId, { email: 1 }).lean(),
		Profile.findOne({ userId }, { displayName: 1, avatarKey: 1 }).lean(),
	]);
	if (!user) return null;
	return {
		id: user._id,
		email: user.email,
		profile: profile ? { displayName: profile.displayName, avatarKey: profile.avatarKey ?? null } : null,
	};
}

export interface NewUser {
	userId: string;
	email: string;
	passwordHash: string;
	displayName: string;
	now: number;
}

/**
 * Creates a user and their profile. The standalone local MongoDB has no multi-document transactions,
 * so a failed profile insert removes the user again (the unique email index guards concurrent signups).
 */
export async function insertUserWithProfile(user: NewUser): Promise<void> {
	const at = new Date(user.now);
	await User.create({
		_id: user.userId,
		email: user.email,
		passwordHash: user.passwordHash,
		preferences: { ...DEFAULT_PREFERENCES },
		createdAt: at,
		updatedAt: at,
	});
	try {
		await Profile.create({ userId: user.userId, displayName: user.displayName, avatarKey: null, createdAt: at, updatedAt: at });
	} catch (error) {
		await User.deleteOne({ _id: user.userId });
		throw error;
	}
}

export function isUniqueEmailViolation(error: unknown): boolean {
	const candidate = error as { code?: number; keyPattern?: Record<string, unknown> } | null;
	return candidate?.code === 11000 && candidate.keyPattern?.email !== undefined;
}

export async function updatePasswordHash(userId: string, passwordHash: string, now: number): Promise<void> {
	await User.updateOne({ _id: userId }, { $set: { passwordHash, updatedAt: new Date(now) } });
}

export async function updateDisplayName(userId: string, displayName: string, now: number): Promise<void> {
	await Profile.updateOne({ userId }, { $set: { displayName, updatedAt: new Date(now) } });
}

export async function updateAvatarKey(userId: string, avatarKey: string | null, now: number): Promise<void> {
	await Profile.updateOne({ userId }, { $set: { avatarKey, updatedAt: new Date(now) } });
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
	const user = await User.findById(userId, { preferences: 1 }).lean();
	return { ...DEFAULT_PREFERENCES, ...(user?.preferences ?? {}) };
}

export async function updatePreferences(userId: string, updates: Partial<UserPreferences>, now: number): Promise<UserPreferences> {
	const $set: Record<string, unknown> = { updatedAt: new Date(now) };
	for (const [key, value] of Object.entries(updates)) $set[`preferences.${key}`] = value;
	await User.updateOne({ _id: userId }, { $set });
	return getPreferences(userId);
}
