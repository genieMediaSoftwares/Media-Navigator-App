import { getConfig } from '../config/env';
import type { ConnectedAccountRow } from '../db/accounts';
import { ContentItem } from '../models';
import { getPlatformCredentials } from './credentials';
import { getMetaApiVersion } from './instagram';

// Downloads a post's own media (cover image or video) for AI analysis. Only HTTPS URLs on Meta's
// media CDNs are fetched (the URLs come from the Graph API, never from the client), with a size cap,
// so this cannot be used to reach arbitrary hosts.

const ALLOWED_HOST_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net'];

export function isAllowedMediaUrl(raw: string | null): raw is string {
	if (!raw) return false;
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' && ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
	} catch {
		return false;
	}
}

export class MediaTooLargeError extends Error {
	constructor() {
		super('Media exceeds the analysis size limit.');
	}
}

/** Downloads at most `maxBytes`. Returns null when the URL is not allowed or the CDN refuses (e.g. an expired URL). */
export async function downloadMedia(
	url: string | null,
	maxBytes: number,
	fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
	if (!isAllowedMediaUrl(url)) return null;
	let res: Response;
	try {
		res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
	} catch {
		return null;
	}
	if (!res.ok || !res.body) return null;
	const declared = Number(res.headers.get('content-length') ?? 0);
	if (declared > maxBytes) throw new MediaTooLargeError();
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new MediaTooLargeError();
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'application/octet-stream';
	return { bytes, mimeType };
}

/**
 * Meta's media URLs expire. Asks the Graph API for the post's current media_url / thumbnail_url and
 * stores them. Returns null when the platform did not answer.
 */
export async function refreshInstagramMediaUrls(
	account: ConnectedAccountRow,
	platformContentId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ mediaUrl: string | null; thumbnailUrl: string | null } | null> {
	if (account.platform !== 'instagram') return null;
	const credentials = await getPlatformCredentials(account.user_id, account.token_reference);
	if (!credentials?.accessToken) return null;
	const config = getConfig();
	const token = encodeURIComponent(credentials.accessToken);
	for (const base of [config.META_GRAPH_BASE_URL, config.INSTAGRAM_GRAPH_BASE_URL]) {
		try {
			const res = await fetchImpl(`${base}/${getMetaApiVersion()}/${encodeURIComponent(platformContentId)}?fields=media_url,thumbnail_url&access_token=${token}`);
			if (!res.ok) continue;
			const body = (await res.json()) as { media_url?: string; thumbnail_url?: string };
			const urls = { mediaUrl: body.media_url ?? null, thumbnailUrl: body.thumbnail_url ?? null };
			await ContentItem.updateOne(
				{ connectedAccountId: account.id, platformContentId },
				{ $set: { ...(urls.mediaUrl && { mediaUrl: urls.mediaUrl }), ...(urls.thumbnailUrl && { thumbnailUrl: urls.thumbnailUrl }) } },
			);
			return urls;
		} catch {
			// try the next API
		}
	}
	return null;
}

export function toBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64');
}
