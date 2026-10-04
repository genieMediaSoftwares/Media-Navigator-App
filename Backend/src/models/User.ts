import { model, Schema } from 'mongoose';

import { newId } from './ids';

export interface UserPreferences {
	/** IANA zone used when the app does not send one (planner, timing). null = use the device zone. */
	timeZone: string | null;
	notifySyncResults: boolean;
	notifyAiInsights: boolean;
	notifyConnectionIssues: boolean;
}

export interface UserDoc {
	_id: string;
	/** Normalized: trimmed and lower-cased. */
	email: string;
	/** Self-describing PBKDF2 string. Never plaintext, never selected unless asked for. */
	passwordHash: string;
	preferences: UserPreferences;
	createdAt: Date;
	updatedAt: Date;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
	timeZone: null,
	notifySyncResults: true,
	notifyAiInsights: true,
	notifyConnectionIssues: true,
};

const preferencesSchema = new Schema<UserPreferences>(
	{
		timeZone: { type: String, default: null },
		notifySyncResults: { type: Boolean, default: true },
		notifyAiInsights: { type: Boolean, default: true },
		notifyConnectionIssues: { type: Boolean, default: true },
	},
	{ _id: false },
);

const userSchema = new Schema<UserDoc>(
	{
		_id: { type: String, default: newId },
		email: { type: String, required: true, minlength: 3, maxlength: 254 },
		passwordHash: { type: String, required: true, select: false, match: /^pbkdf2-sha256\$/ },
		preferences: { type: preferencesSchema, default: () => ({ ...DEFAULT_PREFERENCES }) },
		createdAt: { type: Date, required: true },
		updatedAt: { type: Date, required: true },
	},
	{ collection: 'users', versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true, name: 'email_1' });

export const User = model<UserDoc>('User', userSchema);
