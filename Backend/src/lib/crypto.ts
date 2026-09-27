const encoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	return Uint8Array.from(atob(base64 + padding), (char) => char.charCodeAt(0));
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison (Workers-specific extension to Web Crypto). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
