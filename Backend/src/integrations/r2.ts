import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppConfig, getConfig } from '../config/env';
import { HttpError } from '../lib/http';

// Cloudflare R2 through its S3-compatible API. R2 stores file bytes only; MongoDB (StoredFile) stores
// the metadata. Credentials come from the server environment and are never returned or logged.

export function isR2Configured(config: AppConfig = getConfig()): boolean {
	return Boolean(config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET_NAME && (config.R2_ENDPOINT || config.R2_ACCOUNT_ID));
}

let cached: { client: S3Client; signature: string } | null = null;

/** Injected in tests. */
let clientOverride: S3Client | null = null;
export function setR2ClientForTests(client: S3Client | null): void {
	clientOverride = client;
}

function client(): { s3: S3Client; bucket: string } {
	const config = getConfig();
	if (!isR2Configured(config)) {
		throw new HttpError(503, 'STORAGE_NOT_CONFIGURED', 'File storage is not configured on this server yet.');
	}
	const bucket = config.R2_BUCKET_NAME as string;
	if (clientOverride) return { s3: clientOverride, bucket };
	const endpoint = config.R2_ENDPOINT ?? `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
	const signature = `${endpoint}|${config.R2_ACCESS_KEY_ID}`;
	if (!cached || cached.signature !== signature) {
		cached = {
			signature,
			client: new S3Client({
				region: 'auto',
				endpoint,
				credentials: { accessKeyId: config.R2_ACCESS_KEY_ID as string, secretAccessKey: config.R2_SECRET_ACCESS_KEY as string },
			}),
		};
	}
	return { s3: cached.client, bucket };
}

export async function uploadObject(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
	const { s3, bucket } = client();
	await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<{ body: Uint8Array; contentType: string | null } | null> {
	const { s3, bucket } = client();
	try {
		const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
		return { body: await result.Body!.transformToByteArray(), contentType: result.ContentType ?? null };
	} catch (error) {
		if ((error as { name?: string }).name === 'NoSuchKey') return null;
		throw error;
	}
}

/** Size and type of a stored object, or null when it does not exist. */
export async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
	const { s3, bucket } = client();
	try {
		const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
	} catch (error) {
		const name = (error as { name?: string }).name;
		if (name === 'NotFound' || name === 'NoSuchKey') return null;
		throw error;
	}
}

export async function deleteObject(key: string): Promise<void> {
	const { s3, bucket } = client();
	await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** A short-lived URL the app can GET the object from. */
export async function createPresignedDownloadUrl(key: string, expiresInSeconds = 600): Promise<string> {
	const { s3, bucket } = client();
	return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
}

/**
 * A short-lived URL the app can PUT exactly one object to. Content-Type and Content-Length are part of
 * the signature, so the upload must match the declared type and size.
 */
export async function createPresignedUploadUrl(key: string, contentType: string, contentLength: number, expiresInSeconds = 300): Promise<string> {
	const { s3, bucket } = client();
	return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }), {
		expiresIn: expiresInSeconds,
		signableHeaders: new Set(['content-type', 'content-length']),
	});
}
