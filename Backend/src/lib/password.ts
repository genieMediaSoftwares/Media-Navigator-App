import { fromBase64Url, randomBytes, timingSafeEqual, toBase64Url } from './crypto';

// PBKDF2-HMAC-SHA256 using the runtime's native Web Crypto implementation (no dependency).
// 100,000 iterations is the maximum the Cloudflare Workers runtime accepts for PBKDF2.
// Hashes are self-describing, so parameters can be raised later and old hashes still verify.
const ALGORITHM_ID = 'pbkdf2-sha256';
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const hash = await derive(password, salt, ITERATIONS);
	return `${ALGORITHM_ID}$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algorithm, iterationsText, saltText, hashText] = stored.split('$');
	const iterations = Number(iterationsText);
	if (algorithm !== ALGORITHM_ID || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) {
		return false;
	}
	const expected = fromBase64Url(hashText);
	const actual = await derive(password, fromBase64Url(saltText), iterations);
	return timingSafeEqual(actual, expected);
}

let timingEqualizationHash: Promise<string> | undefined;

/**
 * Runs a full verification against a throwaway hash so that logins for unknown emails take
 * as long as logins for known emails (limits account enumeration by timing).
 */
export async function equalizeVerificationTiming(password: string): Promise<void> {
	timingEqualizationHash ??= hashPassword(toBase64Url(randomBytes(32)));
	await verifyPassword(password, await timingEqualizationHash);
}
