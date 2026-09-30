import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

// Web Crypto (globalThis.crypto) is used for hashing and encryption so values produced by the former
// Cloudflare Worker (password hashes, encrypted credentials, token hashes) stay byte-for-byte compatible.

const encoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const buffer = Buffer.from(value, 'base64url');
	const bytes = new Uint8Array(buffer.byteLength);
	bytes.set(buffer);
	return bytes;
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
	return Buffer.from(digest).toString('hex');
}

/** Constant-time comparison. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	return a.byteLength === b.byteLength && nodeTimingSafeEqual(a, b);
}
