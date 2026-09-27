import { fromBase64Url, randomBytes, toBase64Url } from '../lib/crypto';
import { HttpError } from '../lib/http';

export interface PlatformCredentials {
	accessToken: string;
	refreshToken?: string | null;
	expiresAt?: number | null;
	tokenType?: string;
	scope?: string;
}

interface EncryptedPayload {
	iv: string;
	ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getCryptoKey(encryptionKeySecret: string): Promise<CryptoKey> {
	if (!encryptionKeySecret || encryptionKeySecret.trim() === '') {
		throw new HttpError(
			500,
			'CONFIG_ERROR',
			'Server credential encryption is not configured. ENCRYPTION_KEY secret is required.',
		);
	}
	const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(encryptionKeySecret)));
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptPayload(keySecret: string, data: unknown): Promise<EncryptedPayload> {
	const key = await getCryptoKey(keySecret);
	const iv = randomBytes(12);
	const plaintext = encoder.encode(JSON.stringify(data));
	const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
	return {
		iv: toBase64Url(iv),
		ciphertext: toBase64Url(new Uint8Array(ciphertextBuffer)),
	};
}

async function decryptPayload<T>(keySecret: string, encrypted: EncryptedPayload): Promise<T> {
	const key = await getCryptoKey(keySecret);
	const iv = fromBase64Url(encrypted.iv);
	const ciphertext = fromBase64Url(encrypted.ciphertext);
	const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
	return JSON.parse(decoder.decode(decryptedBuffer)) as T;
}

function credentialKvKey(userId: string, tokenReference: string): string {
	return `credentials:${userId}:${tokenReference}`;
}

/**
 * Encrypts and stores platform credentials in Cloudflare KV associated with the authenticated user.
 * Returns a safe, non-sensitive `token_reference` string suitable for storage in D1 `connected_accounts`.
 */
export async function storePlatformCredentials(
	env: Env,
	userId: string,
	credentials: PlatformCredentials,
): Promise<string> {
	const tokenReference = `cred_${crypto.randomUUID()}`;
	const key = credentialKvKey(userId, tokenReference);
	const encrypted = await encryptPayload(env.ENCRYPTION_KEY, credentials);
	await env.CACHE.put(key, JSON.stringify(encrypted));
	return tokenReference;
}

/**
 * Retrieves and decrypts platform credentials from Cloudflare KV for the specified user and token reference.
 * Returns null if the credential does not exist or does not belong to the user.
 */
export async function getPlatformCredentials(
	env: Env,
	userId: string,
	tokenReference: string,
): Promise<PlatformCredentials | null> {
	const key = credentialKvKey(userId, tokenReference);
	const raw = await env.CACHE.get(key);
	if (!raw) return null;
	try {
		const encrypted = JSON.parse(raw) as EncryptedPayload;
		return await decryptPayload<PlatformCredentials>(env.ENCRYPTION_KEY, encrypted);
	} catch (error) {
		console.error('Failed to decrypt platform credentials', { userId, tokenReference });
		return null;
	}
}

/**
 * Permanently deletes stored platform credentials from Cloudflare KV when an account is disconnected.
 */
export async function deletePlatformCredentials(
	env: Env,
	userId: string,
	tokenReference: string,
): Promise<void> {
	const key = credentialKvKey(userId, tokenReference);
	await env.CACHE.delete(key);
}
