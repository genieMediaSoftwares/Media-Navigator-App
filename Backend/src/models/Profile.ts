import { model, Schema } from 'mongoose';

import { newId } from './ids';

export interface ProfileDoc {
	_id: string;
	userId: string;
	displayName: string;
	/** Key of an R2 object (see StoredFile); null until the user uploads an avatar. */
	avatarKey: string | null;
	createdAt: Date;
	updatedAt: Date;
}

const profileSchema = new Schema<ProfileDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		displayName: { type: String, required: true, minlength: 1, maxlength: 80 },
		avatarKey: { type: String, default: null },
		createdAt: { type: Date, required: true },
		updatedAt: { type: Date, required: true },
	},
	{ collection: 'profiles', versionKey: false },
);

profileSchema.index({ userId: 1 }, { unique: true, name: 'profiles_user_id_unique' });

export const Profile = model<ProfileDoc>('Profile', profileSchema);
