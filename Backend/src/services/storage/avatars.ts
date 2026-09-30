import { updateAvatarKey } from '../../db/users';
import { HttpError } from '../../lib/http';
import { createPresignedDownloadUrl, createPresignedUploadUrl, deleteObject, headObject } from '../../integrations/r2';
import { Profile, StoredFile } from '../../models';

// Profile photos: the app asks for a presigned PUT URL (type and size are validated here and bound into
// the signature), uploads the bytes straight to R2, then confirms. The server checks the stored object
// before the profile points at it.

export const AVATAR_MIME_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function createAvatarUpload(userId: string, mimeType: string, size: number, now: number) {
	const extension = AVATAR_MIME_TYPES[mimeType];
	if (!extension) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Use a JPEG, PNG or WebP image.', { mimeType: 'Unsupported image type.' });
	}
	if (!Number.isInteger(size) || size < 1 || size > AVATAR_MAX_BYTES) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Images must be smaller than 5 MB.', { size: 'Images must be smaller than 5 MB.' });
	}
	const fileId = crypto.randomUUID();
	const objectKey = `avatars/${userId}/${fileId}.${extension}`;
	const uploadUrl = await createPresignedUploadUrl(objectKey, mimeType, size);
	await StoredFile.create({
		_id: fileId,
		userId,
		purpose: 'avatar',
		objectKey,
		mimeType,
		size,
		status: 'pending',
		createdAt: new Date(now),
		uploadedAt: null,
	});
	return { fileId, uploadUrl, method: 'PUT' as const, headers: { 'Content-Type': mimeType }, expiresInSeconds: 300 };
}

export async function confirmAvatarUpload(userId: string, fileId: string, now: number) {
	const file = await StoredFile.findOne({ _id: fileId, userId, purpose: 'avatar' }).lean();
	if (!file) throw new HttpError(404, 'FILE_NOT_FOUND', 'Upload not found.');
	const stored = await headObject(file.objectKey);
	if (!stored) throw new HttpError(400, 'UPLOAD_INCOMPLETE', 'The image has not finished uploading.');
	if (stored.size !== file.size || stored.size > AVATAR_MAX_BYTES || (stored.contentType && stored.contentType !== file.mimeType)) {
		await deleteObject(file.objectKey);
		await StoredFile.deleteOne({ _id: file._id });
		throw new HttpError(400, 'VALIDATION_ERROR', 'The uploaded image did not match the declared type or size.');
	}

	const previous = await Profile.findOne({ userId }, { avatarKey: 1 }).lean();
	await StoredFile.updateOne({ _id: file._id }, { $set: { status: 'uploaded', uploadedAt: new Date(now) } });
	await updateAvatarKey(userId, file.objectKey, now);
	if (previous?.avatarKey && previous.avatarKey !== file.objectKey) await removeStoredObject(userId, previous.avatarKey);
	return { avatarKey: file.objectKey };
}

export async function avatarDownloadUrl(userId: string): Promise<string | null> {
	const profile = await Profile.findOne({ userId }, { avatarKey: 1 }).lean();
	return profile?.avatarKey ? createPresignedDownloadUrl(profile.avatarKey) : null;
}

export async function removeAvatar(userId: string, now: number): Promise<void> {
	const profile = await Profile.findOne({ userId }, { avatarKey: 1 }).lean();
	if (!profile?.avatarKey) return;
	await updateAvatarKey(userId, null, now);
	await removeStoredObject(userId, profile.avatarKey);
}

async function removeStoredObject(userId: string, objectKey: string): Promise<void> {
	await deleteObject(objectKey);
	await StoredFile.deleteOne({ userId, objectKey });
}

/** Deletes every stored object of a user (account deletion). */
export async function deleteAllUserFiles(userId: string): Promise<void> {
	const files = await StoredFile.find({ userId }, { objectKey: 1 }).lean();
	for (const file of files) await deleteObject(file.objectKey).catch(() => undefined);
	await StoredFile.deleteMany({ userId });
}
