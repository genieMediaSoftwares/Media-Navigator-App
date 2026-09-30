import { getConfig } from '../config/env';
import { fromBase64Url, randomBytes, toBase64Url } from '../lib/crypto';
import { HttpError } from '../lib/http';
import { PlatformCredential } from '../models';

// Platform tokens are encrypted with AES-256-GCM before they are written to MongoDB. The key is
// SHA-256(ENCRYPTION_KEY) — the same derivation the former Worker used, so credentials migrated from
// KV decrypt unchanged. Plaintext tokens never leave the server: they are not returned by the API,
// not logged, and not included in Gemini prompts.

export interface PlatformCredentials {
	accessToken: string;
	refreshToken?: string | null;
	expiresAt?: number | null;
	tokenType?: string;
	scope?: string;
}

export interface EncryptedPayload {
	iv: string;
	ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getCryptoKey(): Promise<CryptoKey> {
	const secret = getConfig().ENCRYPTION_KEY;
	if (!secret) {
		throw new HttpError(500, 'CONFIG_ERROR', 'Server credential encryption is not configured. ENCRYPTION_KEY is required.');
	}
	const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret)));
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(data: unknown): Promise<EncryptedPayload> {
	const key = await getCryptoKey();
	const iv = randomBytes(12);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(data)));
	return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(encrypted: EncryptedPayload): Promise<T> {
	const key = await getCryptoKey();
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(encrypted.iv) }, key, fromBase64Url(encrypted.ciphertext));
	return JSON.parse(decoder.decode(plaintext)) as T;
}

/**
 * Encrypts and stores platform credentials for the user. Returns a non-secret token reference that
 * ConnectedAccount stores instead of the token.
 */
export async function storePlatformCredentials(userId: string, credentials: PlatformCredentials, now = Date.now()): Promise<string> {
	const tokenReference = `cred_${crypto.randomUUID()}`;
	const encrypted = await encryptJson(credentials);
	await PlatformCredential.create({ _id: tokenReference, userId, ...encrypted, createdAt: new Date(now) });
	return tokenReference;
}

/** Decrypts the user's credential, or returns null when it is missing, foreign, or undecryptable. */
export async function getPlatformCredentials(userId: string, tokenReference: string): Promise<PlatformCredentials | null> {
	const stored = await PlatformCredential.findOne({ _id: tokenReference, userId }).lean();
	if (!stored) return null;
	try {
		return await decryptJson<PlatformCredentials>({ iv: stored.iv, ciphertext: stored.ciphertext });
	} catch {
		console.error('Failed to decrypt platform credentials', { tokenReference });
		return null;
	}
}

/** Replaces the stored credential in place (token refresh), keeping the same reference. */
export async function updatePlatformCredentials(userId: string, tokenReference: string, credentials: PlatformCredentials): Promise<void> {
	const encrypted = await encryptJson(credentials);
	await PlatformCredential.updateOne({ _id: tokenReference, userId }, { $set: encrypted });
}

/** Permanently deletes a stored credential (disconnect, reconnect with a new token, account deletion). */
export async function deletePlatformCredentials(userId: string, tokenReference: string): Promise<void> {
	await PlatformCredential.deleteOne({ _id: tokenReference, userId });
}
