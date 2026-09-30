import { model, Schema } from 'mongoose';

import { newId } from './ids';

/** Metadata for an object stored in Cloudflare R2. MongoDB holds the metadata; R2 holds the bytes. */
export interface StoredFileDoc {
	_id: string;
	userId: string;
	purpose: 'avatar';
	objectKey: string;
	mimeType: string;
	/** Declared size in bytes; verified against R2 when the upload is confirmed. */
	size: number;
	status: 'pending' | 'uploaded';
	createdAt: Date;
	uploadedAt: Date | null;
}

const storedFileSchema = new Schema<StoredFileDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		purpose: { type: String, required: true, enum: ['avatar'] },
		objectKey: { type: String, required: true },
		mimeType: { type: String, required: true },
		size: { type: Number, required: true, min: 1 },
		status: { type: String, required: true, enum: ['pending', 'uploaded'] },
		createdAt: { type: Date, required: true },
		uploadedAt: { type: Date, default: null },
	},
	{ collection: 'files', versionKey: false },
);

storedFileSchema.index({ objectKey: 1 }, { unique: true, name: 'files_object_key_unique' });
storedFileSchema.index({ userId: 1, purpose: 1 }, { name: 'files_user_purpose_idx' });

export const StoredFile = model<StoredFileDoc>('StoredFile', storedFileSchema);
