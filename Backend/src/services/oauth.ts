import { getConfig } from '../config/env';
import { randomBytes, sha256Hex, toBase64Url } from '../lib/crypto';
import { HttpError } from '../lib/http';
import { OAuthState, Platform } from '../models';
import { decryptJson, encryptJson } from './credentials';

// OAuth `state` handling shared by every provider. The state is 32 random bytes, bound to the user who
// started the flow, single-use, and valid for 10 minutes. Only its SHA-256 is stored.

/**
 * Accepts only app deep links (schemes from APP_REDIRECT_SCHEMES, e.g. medianavigator:// and Expo Go's
 * exp://), so the public callback can never be used as an open redirect to a website.
 */
export function resolveReturnUrl(raw: string | null | undefined): string {
	if (!raw) return getConfig().DEFAULT_RETURN_URL;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid return URL.', { returnUrl: 'Invalid return URL.' });
	}
	const schemes = getConfig()
		.APP_REDIRECT_SCHEMES.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (!schemes.includes(url.protocol.replace(/:$/, '').toLowerCase())) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Return URL must be an app link.', { returnUrl: 'Return URL must be an app link.' });
	}
	return raw;
}

/** Appends status parameters to the app return URL. */
export function appRedirect(returnUrl: string, params: Record<string, string>): string {
	const separator = returnUrl.includes('?') ? '&' : '?';
	return `${returnUrl}${separator}${new URLSearchParams(params).toString()}`;
}

export async function createOAuthState(
	userId: string,
	platform: Platform,
	returnUrl: string,
	options: { codeVerifier?: string; now?: number } = {},
): Promise<string> {
	const state = toBase64Url(randomBytes(32));
	const now = options.now ?? Date.now();
	await OAuthState.create({
		_id: await sha256Hex(state),
		userId,
		platform,
		returnUrl,
		codeVerifier: options.codeVerifier ? await encryptJson(options.codeVerifier) : null,
		expiresAt: new Date(now + getConfig().OAUTH_STATE_TTL_MS),
	});
	return state;
}

export interface ConsumedState {
	userId: string;
	returnUrl: string;
	codeVerifier: string | null;
}

/** Validates and deletes the state in one step. Returns null when unknown, expired, reused or for another platform. */
export async function consumeOAuthState(state: string | null, platform: Platform, now = Date.now()): Promise<ConsumedState | null> {
	if (!state || state.trim() === '' || state.length > 128) return null;
	const record = await OAuthState.findOneAndDelete({ _id: await sha256Hex(state), platform }).lean();
	if (!record || record.expiresAt.getTime() <= now) return null;
	return {
		userId: record.userId,
		returnUrl: record.returnUrl,
		codeVerifier: record.codeVerifier ? await decryptJson<string>(record.codeVerifier) : null,
	};
}

/** PKCE (RFC 7636) verifier and S256 challenge. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
	const verifier = toBase64Url(randomBytes(32));
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
	return { verifier, challenge: toBase64Url(digest) };
}
