import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';

import { overrideConfig } from '../src/config/env';
import { createPresignedUploadUrl, setR2ClientForTests } from '../src/integrations/r2';
import { Profile, StoredFile } from '../src/models';
import { call, getData, signUp } from './helpers';

// R2 is exercised through its S3 API surface with a stand-in client; presigned URLs are computed
// locally by the AWS SDK. No real bucket or credential is used by the tests.

const R2 = {
	R2_ACCOUNT_ID: 'testaccount',
	R2_ACCESS_KEY_ID: 'TESTACCESSKEY',
	R2_SECRET_ACCESS_KEY: 'test-secret-access-key-value',
	R2_BUCKET_NAME: 'media-navigator-test',
};

let restore: (() => void) | null = null;
afterEach(() => {
	restore?.();
	restore = null;
	setR2ClientForTests(null);
});

/** Records commands and answers HeadObject from an in-memory object table. */
function fakeR2(objects: Map<string, { size: number; contentType: string }>) {
	const sent: string[] = [];
	const client = {
		send: async (command: unknown) => {
			if (command instanceof HeadObjectCommand) {
				sent.push(`head:${command.input.Key}`);
				const object = objects.get(command.input.Key as string);
				if (!object) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
				return { ContentLength: object.size, ContentType: object.contentType };
			}
			if (command instanceof DeleteObjectCommand) {
				sent.push(`delete:${command.input.Key}`);
				objects.delete(command.input.Key as string);
				return {};
			}
			throw new Error('unexpected command');
		},
	};
	return { client: client as unknown as S3Client, sent };
}

describe('Cloudflare R2 storage', () => {
	it('reports storage as not configured instead of failing obscurely', async () => {
		const user = await signUp();
		const res = await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/png', size: 1000 } });
		expect(res.status).toBe(503);
		expect(res.body).toMatchObject({ error: { code: 'STORAGE_NOT_CONFIGURED' } });
	});

	it('presigns uploads against the R2 endpoint with the content type and length bound into the signature', async () => {
		restore = overrideConfig(R2);
		const url = new URL(await createPresignedUploadUrl('avatars/u/f.png', 'image/png', 1234));
		expect(url.host).toBe('media-navigator-test.testaccount.r2.cloudflarestorage.com');
		expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
		expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
		expect(url.searchParams.get('X-Amz-Credential')).toContain('/auto/s3/');
		expect(url.toString()).not.toContain(R2.R2_SECRET_ACCESS_KEY);
	});

	it('validates avatar MIME type and size before issuing an upload URL', async () => {
		restore = overrideConfig(R2);
		const user = await signUp();
		const badType = await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/svg+xml', size: 1000 } });
		expect(badType.status).toBe(400);
		const tooBig = await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/png', size: 6 * 1024 * 1024 } });
		expect(tooBig.status).toBe(400);
		const empty = await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/png', size: 0 } });
		expect(empty.status).toBe(400);
	});

	it('stores metadata in MongoDB, verifies the uploaded object, sets the avatar and deletes replaced objects', async () => {
		restore = overrideConfig(R2);
		const user = await signUp();
		const objects = new Map<string, { size: number; contentType: string }>();
		const { client, sent } = fakeR2(objects);

		const first = getData(await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/png', size: 2048 } }));
		expect(first).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });
		expect(first.uploadUrl).toContain('X-Amz-Signature=');
		const firstFile = await StoredFile.findById(first.fileId).lean();
		expect(firstFile).toMatchObject({ userId: user.userId, status: 'pending', mimeType: 'image/png', size: 2048 });
		expect(firstFile?.objectKey).toMatch(new RegExp(`^avatars/${user.userId}/.+\\.png$`));

		setR2ClientForTests(client);
		// Not uploaded yet.
		expect((await call('POST', '/api/profile/avatar/confirm', { token: user.token, body: { fileId: first.fileId } })).status).toBe(400);

		objects.set(firstFile!.objectKey, { size: 2048, contentType: 'image/png' });
		const confirmed = await call('POST', '/api/profile/avatar/confirm', { token: user.token, body: { fileId: first.fileId } });
		expect(confirmed.status).toBe(200);
		expect(getData(confirmed).user.profile.avatarKey).toBe(firstFile!.objectKey);

		// Another user cannot confirm someone else's upload.
		const other = await signUp();
		expect((await call('POST', '/api/profile/avatar/confirm', { token: other.token, body: { fileId: first.fileId } })).status).toBe(404);

		// A mismatched upload (different size than declared) is rejected and removed.
		setR2ClientForTests(null);
		const bad = getData(await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/jpeg', size: 100 } }));
		const badFile = await StoredFile.findById(bad.fileId).lean();
		objects.set(badFile!.objectKey, { size: 999_999, contentType: 'image/jpeg' });
		setR2ClientForTests(client);
		expect((await call('POST', '/api/profile/avatar/confirm', { token: user.token, body: { fileId: bad.fileId } })).status).toBe(400);
		expect(objects.has(badFile!.objectKey)).toBe(false);
		expect(await StoredFile.countDocuments({ _id: bad.fileId })).toBe(0);

		// Replacing the avatar deletes the previous object.
		setR2ClientForTests(null);
		const second = getData(await call('POST', '/api/profile/avatar/upload-url', { token: user.token, body: { mimeType: 'image/webp', size: 512 } }));
		const secondFile = await StoredFile.findById(second.fileId).lean();
		objects.set(secondFile!.objectKey, { size: 512, contentType: 'image/webp' });
		setR2ClientForTests(client);
		await call('POST', '/api/profile/avatar/confirm', { token: user.token, body: { fileId: second.fileId } });
		expect(sent).toContain(`delete:${firstFile!.objectKey}`);
		expect((await Profile.findOne({ userId: user.userId }).lean())?.avatarKey).toBe(secondFile!.objectKey);

		// Removing the avatar deletes the object and clears the key.
		const removed = await call('DELETE', '/api/profile/avatar', { token: user.token });
		expect(getData(removed).user.profile.avatarKey).toBeNull();
		expect(sent).toContain(`delete:${secondFile!.objectKey}`);
		expect(await StoredFile.countDocuments({ userId: user.userId })).toBe(0);
	});
});
